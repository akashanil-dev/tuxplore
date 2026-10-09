'use strict';
// Entry point.

OS.bus.on('shell:line', ({ piped, code }) => { if (piped && code === 0) OS.achievements.unlock('first_pipe'); });

document.body.dataset.theme = OS.state.theme;
OS.analytics.init();
OS.boot.start();
