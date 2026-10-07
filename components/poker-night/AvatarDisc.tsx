// A player's look as lib/poker-night/avatar encodes it ('v1:fox:tangerine:ring:crown'): the face on
// its colour, inside its frame (none, ring, double, dashed, gold, neon — app/globals.css's
// .pn-avatar[data-frame] rules), with its badge at the shoulder. The glyphs come from the avatar
// module's code points (no emoji is written here) and the colours from LOOKS_CSS through
// data-pn-av-bg; a part this version does not know falls back on its own (resolveAvatar), so a
// tampered value still draws. Its accessible name reads the look out ("Owl on sky, with a gold
// frame and a crown") unless the caller names it, or it is decorative beside the player's name.

import type {CSSProperties} from "react";
import {AVATAR_COPY} from "@/lib/learn/copy/poker-night";
import {badgeGlyph, faceGlyph, resolveAvatar} from "@/lib/poker-night/avatar";
import {cn} from "@/lib/utils";

type Props = {
    avatar: string | null | undefined;
    size?: number; // px; the room's --pn-av when not given (a drawer, portaled out of the room, always gives one)
    decorative?: boolean; // the name beside it already says who it is
    label?: string; // the accessible name, when the look's own words are not the right one
    className?: string;
};

const AvatarDisc = ({avatar, size, decorative = false, label, className}: Props) => {
    const spec = resolveAvatar(avatar);
    const badge = badgeGlyph(spec.badge);
    const style = size === undefined ? undefined : ({'--pn-av-size': `${size}px`} as CSSProperties);
    return (
        <span
            className={cn('pn-avatar rounded-full', className)}
            style={style}
            data-pn-av-bg={spec.colour}
            data-frame={spec.frame}
            data-avatar={avatar ?? ''}
            {...(decorative ? {'aria-hidden': true} : {role: 'img', 'aria-label': label ?? AVATAR_COPY.describe(spec)})}
        >
            <span aria-hidden="true">{faceGlyph(spec.face)}</span>
            {badge && <span className="pn-avatar-badge" aria-hidden="true">{badge}</span>}
        </span>
    );
};

export default AvatarDisc;
