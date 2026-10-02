#!/usr/bin/env bash
# Browser QA in one command. Starts a throwaway harness — an in-memory MongoDB on :27117, the app
# (`next dev`) on :3000 with inline environment variables, the Inngest dev server on :8288 — runs
# the named suites one after another (every suite when none is named), stops everything it
# started, and prints a summary. Nothing here needs a .env, an API key or a real database.
#
#   npm run qa                        every suite, in the order of ALL below
#   npm run qa -- learn income        just these (qa-learn.mjs, qa-income.mjs; "qa-" is optional)
#   npm run qa -- visual-sweep        any other script in scripts/qa, inside the same harness
#   npm run qa -- --up [name ...]     run the names (if any), then keep the harness up until Ctrl-C
#
# Logs: scripts/qa/output/logs/<name>.log, the harness's own in _mongo.log, _dev.log and
# _inngest.log. The summary is scripts/qa/output/logs/SUMMARY; its last line starts with "DONE".
# The ports must be free: the script refuses to start rather than stop someone else's server.
set -u

QA_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$QA_DIR/../.." && pwd)
LOGS=$QA_DIR/output/logs
APP_PORT=3000
MONGO_PORT=27117
INNGEST_PORT=8288
APP_URL=http://localhost:$APP_PORT

# Every suite, in the order a full run takes. The order is load-bearing: qa-auth removes the
# sign-in and sign-up counters it fills before anyone else signs in, and qa-learn wipes and
# reseeds strategyruns, so it runs after qa-strategies. A suite missing here runs last.
ALL=(auth styles shell chat topics-refresh trading topics news-feed strategies income learn learn-account chat-tutor)

KEEP_UP=0
NAMES=()
for arg in "$@"; do
    case "$arg" in
        --up) KEEP_UP=1 ;;
        -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) NAMES+=("$arg") ;;
    esac
done

# A name is a suite (learn, qa-learn, qa-learn.mjs) or any other script here (visual-sweep).
resolve() {
    local name=${1%.mjs}
    name=${name#qa-}
    if [ -f "$QA_DIR/qa-$name.mjs" ]; then echo "qa-$name"
    elif [ -f "$QA_DIR/$name.mjs" ]; then echo "$name"
    else return 1
    fi
}

RUN=()
if [ ${#NAMES[@]} -eq 0 ] && [ $KEEP_UP -eq 0 ]; then
    for name in "${ALL[@]}"; do RUN+=("qa-$name"); done
    for file in "$QA_DIR"/qa-*.mjs; do
        suite=$(basename "$file" .mjs)
        case " ${RUN[*]} " in *" $suite "*) ;; *) echo "note: $suite is not in run.sh's ALL list; running it last"; RUN+=("$suite") ;; esac
    done
else
    for name in ${NAMES[@]+"${NAMES[@]}"}; do
        script=$(resolve "$name") || { echo "no suite or script named '$name' in scripts/qa"; exit 2; }
        RUN+=("$script")
    done
fi

if [ ! -d "$QA_DIR/node_modules" ]; then
    echo "scripts/qa has no node_modules — run: (cd scripts/qa && npm ci)"
    exit 2
fi

port_busy() {
    if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    else (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
    fi
}
for port in $APP_PORT $MONGO_PORT $INNGEST_PORT; do
    if port_busy "$port"; then
        echo "port $port is already in use — stop whatever listens there first (lsof -nP -iTCP:$port -sTCP:LISTEN)"
        exit 2
    fi
done

for env_file in .env .env.local .env.development .env.development.local; do
    if [ -f "$ROOT/$env_file" ]; then
        echo "note: next dev also loads $env_file; the harness overrides the database, auth, Finnhub and mail settings, but any other key in it (GEMINI_API_KEY) reaches the app"
    fi
done

mkdir -p "$LOGS"
rm -f "$LOGS"/*.log "$LOGS/SUMMARY"

# Everything started here, stopped on any exit: each process with its children (npm and npx
# start the real servers as child processes, mongodb-memory-server its mongod).
PIDS=()
tree() {
    local child
    echo "$1"
    for child in $(pgrep -P "$1" 2>/dev/null); do tree "$child"; done
}
# Git Bash on Windows has no pgrep, and its kill reaches only the shell's own wrapper, never the
# node, mongod and inngest processes under it. The ports were free when the run began (checked
# above), so whatever listens on them now was started here: stop those, each with its children.
on_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }
stop_windows_listeners() {
    local port pid
    for port in $APP_PORT $MONGO_PORT $INNGEST_PORT; do
        for pid in $(netstat -ano -p TCP 2>/dev/null | awk -v p=":$port" '$2 ~ p"$" && $4 == "LISTENING" {print $5}' | sort -u); do
            taskkill //F //T //PID "$pid" >/dev/null 2>&1
        done
    done
}
stop() {
    local all="" pid
    for pid in ${PIDS[@]+"${PIDS[@]}"}; do all="$all $(tree "$pid")"; done
    [ -z "${all// /}" ] && return 0
    on_windows && stop_windows_listeners
    kill $all 2>/dev/null
    sleep 2
    for pid in $all; do kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null; done
    PIDS=()
}
trap stop EXIT
trap 'exit 130' INT TERM

summary() { echo "$*" | tee -a "$LOGS/SUMMARY"; }
harness_failed() {
    summary "HARNESS $1 (see $2)"
    tail -20 "$2"
    summary "DONE failures=harness"
    exit 1
}

started=$SECONDS
summary "QA run $(date '+%Y-%m-%d %H:%M') — $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)@$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"

# 1. MongoDB, in memory.
(cd "$QA_DIR" && exec node start-mongo.mjs) >"$LOGS/_mongo.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do grep -q 'READY\|FAILED' "$LOGS/_mongo.log" 2>/dev/null && break; sleep 1; done
grep -q READY "$LOGS/_mongo.log" || harness_failed "MongoDB did not start" "$LOGS/_mongo.log"

# 2. The app. A .next left by `next build` breaks Turbopack's next/font in dev, so start clean.
# The empty keys keep a local .env's Finnhub and mail settings out: no quotes, no mail sent.
rm -rf "$ROOT/.next"
(cd "$ROOT" && exec env \
    PORT=$APP_PORT \
    MONGODB_URI="mongodb://127.0.0.1:$MONGO_PORT/aerotrade" \
    BETTER_AUTH_SECRET='local-qa-secret-at-least-32-characters-long' \
    BETTER_AUTH_URL="$APP_URL" \
    SIGN_UP_CLIENT_LIMIT=1000 \
    INNGEST_DEV=1 \
    FINNHUB_API_KEY= NEXT_PUBLIC_FINNHUB_API_KEY= NODEMAILER_EMAIL= NODEMAILER_PASSWORD= \
    npm run dev) >"$LOGS/_dev.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 120); do curl -sf -o /dev/null "$APP_URL/sign-in" && break; sleep 2; done
curl -sf -o /dev/null "$APP_URL/sign-in" || harness_failed "the app did not answer on $APP_URL" "$LOGS/_dev.log"

# 3. The Inngest dev server, pointed at the app's /api/inngest. Without it qa-income skips its job
# checks and qa-topics-refresh takes the dead-queue path, so a run says so instead of failing.
(cd "$ROOT" && exec npx --yes inngest-cli@latest dev -u "$APP_URL/api/inngest") >"$LOGS/_inngest.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:$INNGEST_PORT/" && break; sleep 2; done
if curl -sf -o /dev/null "http://localhost:$INNGEST_PORT/"; then
    sleep 8   # let the dev server find the app's functions before a suite sends an event
else
    summary "NOTE  no Inngest dev server (see $LOGS/_inngest.log): job checks are skipped"
fi
summary "harness up in $((SECONDS - started))s"

# 4. The suites.
failed=0
passes=0
fails=0
cd "$QA_DIR" || exit 1
for script in ${RUN[@]+"${RUN[@]}"}; do
    t0=$SECONDS
    node "$script.mjs" >"$LOGS/$script.log" 2>&1
    rc=$?
    pass=$(grep -c '^PASS' "$LOGS/$script.log")
    fail=$(grep -c '^FAIL' "$LOGS/$script.log")
    passes=$((passes + pass))
    fails=$((fails + fail))
    summary "$(printf '%-20s exit=%-3s %4d PASS %3d FAIL %5ss' "$script" "$rc" "$pass" "$fail" $((SECONDS - t0)))"
    if [ "$rc" -ne 0 ]; then
        failed=$((failed + 1))
        grep '^FAIL' "$LOGS/$script.log" | head -10 | sed 's/^/    /'
    fi
done
[ ${#RUN[@]} -gt 0 ] && summary "DONE failures=$failed  ($passes PASS, $fails FAIL, $((SECONDS - started))s; logs in ${LOGS#"$ROOT"/})"

if [ $KEEP_UP -eq 1 ]; then
    echo "harness up: $APP_URL (MongoDB :$MONGO_PORT, Inngest :$INNGEST_PORT) — Ctrl-C stops it"
    wait
fi
[ "$failed" -eq 0 ]
