// While a window is dragged/resized, the YouTube iframe must not receive pointer
// events: if the cursor slides over it, the iframe swallows the mouseup and the
// window stays stuck to the cursor.
export const lockIframes = () => document.body.classList.add('is-dragging');
export const unlockIframes = () => document.body.classList.remove('is-dragging');
