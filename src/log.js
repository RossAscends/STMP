var log4js = require("log4js");

var logLevel = process.env.LOG_LEVEL || "INFO";

log4js.configure({
    appenders: {
        out: { type: "stdout" },
    },
    categories: {
        default: { appenders: ["out"], level: logLevel },
        server: { appenders: ["out"], level: logLevel },
        db: { appenders: ["out"], level: logLevel },
        api: { appenders: ["out"], level: logLevel },
        file: { appenders: ["out"], level: logLevel },
        char: { appenders: ["out"], level: logLevel },
    },
});

module.exports = {
    logger: log4js.getLogger("server"),
    dbLogger: log4js.getLogger("db"),
    apiLogger: log4js.getLogger("api"),
    fileLogger: log4js.getLogger("file"),
    charLogger: log4js.getLogger("char"),
};