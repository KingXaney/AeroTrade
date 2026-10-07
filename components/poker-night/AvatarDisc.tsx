// A player's look as lib/poker-night/avatar encodes it ('v1:fox:tangerine:ring:crown'): the face on
// its colour, inside its frame, with its badge. The glyphs come from the avatar module's code points
// (no emoji is written here) and the colours from LOOKS_CSS through data-pn-av-bg; a part this
// version does not know falls back on its own (resolveAvatar), so a tampered value still draws.

import type {CSSProperties} from "react";
import {AVATAR_COPY, JOIN_COPY} from "@/lib/learn/copy/poker-night";
import {badgeGlyph, faceGlyph, resolveAvatar} from "@/lib/poker-night/avatar";
import {cn} from "@/lib/utils";

type Props = {
    avatar: string | null | undefined;
    size?: number; // px; the room's --pn-av when not given
    decorative?: boolean; // the name beside it already says who it is
    className?: string;
};

const AvatarDisc = ({avatar, size, decorative = false, className}: Props) => {
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
            {...(decorative ? {'aria-hidden': true} : {role: 'img', 'aria-label': JOIN_COPY.lookLabel(AVATAR_COPY.faces[spec.face])})}
        >
            <span aria-hidden="true">{faceGlyph(spec.face)}</span>
            {badge && <span className="pn-avatar-badge" aria-hidden="true">{badge}</span>}
        </span>
    );
};

export default AvatarDisc;
