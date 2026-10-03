'use client';

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";
import type {UIMessage} from "ai";
import ChatPanel from "@/components/chat/ChatPanel";
import RobotMascot from "@/components/chat/RobotMascot";
import RobotTipBubble, {type RobotTipAttention} from "@/components/chat/RobotTipBubble";
import {askAdvisor, subscribeAsk} from "@/lib/chat/ask";
import {
    ROBOT_TIP_GAP_MS,
    ROBOT_TIP_HOLD_MS,
    ROBOT_TIP_VISIBLE_MS,
    nextRobotTip,
    readShownTips,
    rememberShownTip,
    robotTipDelay,
    robotTipsOn,
} from "@/lib/chat/robot-tips";
import {getEasternDateString} from "@/lib/dates";
import type {RobotTip} from "@/lib/learn/copy/robot";

type ChatWidgetProps = {
    userId: string;
};

const storageKey = (userId: string) => `aero-chat:${userId}`;

// Restore messages from localStorage at mount. Returns [] if nothing or parse fails — keep failure silent.
const loadMessages = (userId: string): UIMessage[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(storageKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
    } catch {
        return [];
    }
};

// The tips' memory for this tab; a private window may refuse even the read.
const sessionStorageOrNull = (): Storage | null => {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
};

const ChatWidget = ({userId}: ChatWidgetProps) => {
    const [open, setOpen] = useState(false);
    // The question an "Ask in chat" link typed before the panel was open; the panel seeds
    // its composer from it on mount and it is cleared on close so it cannot come back.
    const [pendingInput, setPendingInput] = useState<string | null>(null);
    // Lazily restore persisted messages on first render. The launcher button renders identically
    // on server and client, so reading localStorage here causes no hydration mismatch.
    const [initialMessages, setInitialMessages] = useState<UIMessage[]>(() => loadMessages(userId));
    // The panel's live list. ChatPanel unmounts on close and useChat seeds a new Chat from
    // initialMessages on every mount, so the list is handed back on close: otherwise a reopen
    // showed the page-load conversation, dropping new turns and restoring a cleared one.
    // A ref, not state, so a streaming reply does not re-render the widget on every token.
    const latestMessages = useRef<UIMessage[] | null>(null);

    // Render through a portal to <body> so the widget's fixed position is anchored to the
    // viewport and can never be displaced by an ancestor's transform/filter/overflow.
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the body portal client-side
    useEffect(() => setMounted(true), []);

    // An Ask link anywhere on the page opens the panel with its question in the composer.
    // A click while the panel is already open is handled by the panel itself.
    useEffect(() => subscribeAsk((text) => {
        setPendingInput(text);
        setOpen(true);
    }), []);

    // The robot's tips (lib/chat/robot-tips): on the topics pages, while the panel is closed, one
    // tip at a time — the first after ROBOT_TIP_FIRST_MS, each shown for ROBOT_TIP_VISIBLE_MS, the
    // next ROBOT_TIP_GAP_MS later — and none twice in a browser session. Every setTip runs in a
    // timer callback or the cleanup, never in the effect body, and the date and the storage are
    // read inside the timers, after mount; the widget renders nothing until mounted anyway.
    const pathname = usePathname();
    const onTopics = robotTipsOn(pathname);
    const [tip, setTip] = useState<RobotTip | null>(null);
    // Bumped by Dismiss: the effect restarts and waits the gap before the next tip.
    const [tipRound, setTipRound] = useState(0);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    // The reader's attention on the bubble, as it reports it: while either is up the hide waits,
    // so a tip never leaves mid-read or from under the keyboard.
    const attention = useRef({hover: false, focus: false});
    useEffect(() => {
        if (!onTopics || open) return;
        const storage = sessionStorageOrNull();
        let timer: ReturnType<typeof setTimeout>;
        function hide() {
            if (attention.current.hover || attention.current.focus) {
                timer = setTimeout(hide, ROBOT_TIP_HOLD_MS);
                return;
            }
            // Focus can still sit inside with neither up — the window lost focus while a control had
            // it — so the launcher takes it before the bubble goes, as Dismiss hands it over.
            if (bubbleRef.current?.contains(document.activeElement)) launcherRef.current?.focus();
            setTip(null);
            timer = setTimeout(show, ROBOT_TIP_GAP_MS);
        }
        function show() {
            const next = nextRobotTip(getEasternDateString(), readShownTips(storage));
            if (!next) return; // every tip heard this session: the robot keeps quiet
            rememberShownTip(storage, next.id);
            setTip(next);
            timer = setTimeout(hide, ROBOT_TIP_VISIBLE_MS);
        }
        timer = setTimeout(show, robotTipDelay(readShownTips(storage)));
        return () => {
            clearTimeout(timer);
            // A bubble unmounted from here sends no pointerleave or blur of its own.
            attention.current = {hover: false, focus: false};
            setTip(null);
        };
    }, [onTopics, open, tipRound]);

    // "Try it" goes through the same door as an Ask link: the subscribeAsk handler above opens the
    // panel with the prompt typed, and nothing is sent until the reader presses Send.
    const tryTip = (prompt: string) => askAdvisor(prompt);
    const dismissTip = () => {
        launcherRef.current?.focus();
        setTipRound((n) => n + 1);
    };
    const attend = (kind: RobotTipAttention, on: boolean) => {
        attention.current[kind] = on;
    };

    const persist = useCallback((messages: UIMessage[]) => {
        latestMessages.current = messages;
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(storageKey(userId), JSON.stringify(messages));
        } catch {
            // Quota or serialization error — ignore.
        }
    }, [userId]);

    const close = () => {
        if (latestMessages.current) setInitialMessages(latestMessages.current);
        setOpen(false);
        setPendingInput(null);
    };

    if (!mounted) return null;

    return createPortal(
        <>
            {!open && (
                <button
                    ref={launcherRef}
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open Aero-AI Assistant"
                    // The robot floats bottom-right at every width — the panel opens in the same
                    // corner — and the (root) layout's content wrapper ends in pb-24 so it never
                    // sits on a page's last panel. .robot-launcher carries the scale transition.
                    className="robot-launcher fixed bottom-5 right-5 z-[80] inline-flex size-14 items-center justify-center rounded-full bg-brand-strong text-on-brand [box-shadow:var(--glow)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:bottom-6 sm:right-6"
                >
                    <RobotMascot className="size-9"/>
                </button>
            )}

            {/* After the launcher, so a QA selector's .first() is always the launcher. */}
            {!open && onTopics && tip && (
                <RobotTipBubble ref={bubbleRef} tip={tip} onTry={tryTip} onDismiss={dismissTip} onAttention={attend}/>
            )}

            {open && (
                <ChatPanel
                    userId={userId}
                    initialMessages={initialMessages}
                    onMessagesChange={persist}
                    initialInput={pendingInput}
                    onClose={close}
                />
            )}
        </>,
        document.body,
    );
};

export default ChatWidget;
