"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./src/shared/utils");
var req = { headers: { origin: 'http://localhost:3000' } };
var res = { set: function () { } };
(0, utils_1.setCorsHeaders)(req, res);
