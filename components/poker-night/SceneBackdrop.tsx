// The scene behind the table: the host's choice of room (casino-classic, my-theme, …), painted from
// LOOKS_CSS's --pn-sky by the [data-pn-scene] the room carries. Decoration only; nothing readable
// ever sits on it bare. The scenes' art and ambient loops arrive with the rest of the looks (P5).

const SceneBackdrop = () => <div className="pn-scene" aria-hidden="true" data-pn-scene-layer=""/>;

export default SceneBackdrop;
