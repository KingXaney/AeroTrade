// A QR code's dark modules as the invite sheet draws them: one <rect> per horizontal run, so a
// 33×33 code is a few hundred shapes rather than a thousand. Pure: it reads the module matrix that
// `uqr`'s encode() returns (components/poker-night/QrCode does the encoding) and nothing else.

export type QrRun = {x: number; y: number; w: number};

// Every run of dark modules, row by row, left to right.
export const qrRuns = (matrix: readonly (readonly boolean[])[]): QrRun[] => {
    const runs: QrRun[] = [];
    matrix.forEach((row, y) => {
        let start = -1;
        for (let x = 0; x <= row.length; x++) {
            const dark = x < row.length && row[x] === true;
            if (dark && start < 0) start = x;
            if (!dark && start >= 0) {
                runs.push({x: start, y, w: x - start});
                start = -1;
            }
        }
    });
    return runs;
};
