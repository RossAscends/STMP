import log4js from "log4js";

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

const logger = log4js.getLogger("server");
const dbLogger = log4js.getLogger("db");
const apiLogger = log4js.getLogger("api");
const fileLogger = log4js.getLogger("file");
const charLogger = log4js.getLogger("char");

export { logger, dbLogger, apiLogger, fileLogger, charLogger };