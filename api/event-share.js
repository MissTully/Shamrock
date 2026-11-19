"use strict";

// Pretty public URLs (/events/:id) rewrite here. See vercel.json.
const { handleShareRequest } = require("../lib/event-share-http");

module.exports = function eventShare(req, res) {
  return handleShareRequest(req, res);
};
