/**
 * Compatibility shim — actual implementation moved to startAllLoops.js.
 *
 * Keeping this file so any existing require('./loopBootstrap') calls
 * continue to work without changes.
 *
 * The authoritative loop startup file is: services/startAllLoops.js
 */

"use strict";

const { start } = require("./startAllLoops");

/** @deprecated  Use require('./startAllLoops').start() directly. */
async function init() {
  return start();
}

module.exports = { init };
