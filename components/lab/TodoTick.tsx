'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {tickTodo, untickTodo} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";

// The tick on a manual item of Today's list (the digest, a table, a site outside the app): one
// press writes the day's row, a second removes it. The server re-renders the list and the streak.
const TodoTick = ({id, done}: {id: string; done: boolean}) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const press = async () => {
        if (busy) return;
        setBusy(true);
        const result = await (done ? untickTodo({id}) : tickTodo({id}));
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        router.refresh();
    };
    return (
        <ActionButton variant={done ? 'secondary' : 'primary'} size="sm" onClick={press} disabled={busy} data-todo-tick={id} aria-pressed={done}>
            {done ? LAB_COPY.list.untick : LAB_COPY.list.tick}
        </ActionButton>
    );
};

export default TodoTick;
