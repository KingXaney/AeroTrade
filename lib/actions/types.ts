// The result every server action returns: success, and a message the UI can show.

export type ActionResult = {
    success: boolean;
    message?: string;
};
