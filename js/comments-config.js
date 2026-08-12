"use strict";

window.NH_COMMENTS = Object.freeze({
    apiBase:
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1"
            ? "http://127.0.0.1:8787"
            : "__WORKER_URL__",

    turnstileSiteKey: "0x4AAAAAAEN93J_tVPnB8nki",
});

