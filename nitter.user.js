// ==UserScript==
// @name         Nitter Redirect
// @namespace    https://gitlab.com/ajvant/userscripts
// @version      1.0
// @description  Trivial twitter -> nitter redirect.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// ==/UserScript==

(function() {
    if (location.pathname.startsWith('/i/article'))
        return;
    location.href = `https://nitter.net` + location.pathname;
})();
