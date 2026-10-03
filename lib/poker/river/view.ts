// Reading a river solve (lib/poker/river/solver): one decision's actions, and for each of the 169
// classes how often the acting player takes each action there, how many of that class's combos
// reach it, and their average result. Pure.

import {CLASSES} from "@/lib/poker/cards";
import type {RiverResult} from "@/lib/poker/river/solver";
import {actionKind, DECISION, type ActionKind} from "@/lib/poker/river/tree";

export type ActionView = {
    node: number;
    kind: ActionKind;
    // The chips the action puts in, and what the actor has in on the river after it.
    amount: number;
    total: number;
    // Of the actor's combos that reach the decision, the share that take this action.
    share: number;
};

export type ClassView = {freq: number[]; combos: number; ev: number};

export type NodeView = {
    node: number;
    actor: 0 | 1;
    actions: ActionView[];
    classes: ClassView[];
    // The actor's combos that reach the decision, weighed by how often they get there.
    combos: number;
};

export const viewAt = (result: RiverResult, node: number): NodeView | null => {
    const {tree} = result;
    if (node < 0 || node >= tree.size || tree.kind[node] !== DECISION) return null;
    const d = tree.decisionOf[node];
    const k = tree.childCount[node];
    const actor = tree.player[node] as 0 | 1;
    const base = result.viewOffsets[d];
    const classes: ClassView[] = Array.from({length: CLASSES}, (_, c) => {
        const cell = base + c * (k + 2);
        return {freq: Array.from(result.view.subarray(cell, cell + k)), combos: result.view[cell + k], ev: result.view[cell + k + 1]};
    });
    const combos = classes.reduce((sum, cell) => sum + cell.combos, 0);
    const first = tree.firstChild[node];
    const actions: ActionView[] = Array.from({length: k}, (_, a) => {
        const child = first + a;
        const share = combos > 0 ? classes.reduce((sum, cell) => sum + cell.combos * cell.freq[a], 0) / combos : 0;
        return {node: child, kind: actionKind(tree, child), amount: tree.amount[child], total: tree.invested[2 * child + actor], share};
    });
    return {node, actor, actions, classes, combos};
};

// The combos of a class list that take one action at a decision, weighed by how often they reach it.
export const combosTaking = (view: NodeView, action: number, classIds: readonly number[]): number =>
    classIds.reduce((sum, c) => sum + view.classes[c].combos * view.classes[c].freq[action], 0);
