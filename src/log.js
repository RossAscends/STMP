import log4js from "log4js";

var logLevel = process.env.LOG_LEVEL || "INFO";


function getFunctionName() {
    const err = new Error();
    const stack = err.stack?.split("\n") || [];
    const callerLine = stack[3] || "";
    const match = callerLine.match(/at (.+?) \(/);
    return match ? match[1] : "anonymous";
}

function wrapLogger(logger) {
    const levels = ["trace", "debug", "info", "warn", "error", "fatal", "mark"];
    const wrapped = {};

    for (const level of levels) {
        wrapped[level] = (...args) => {
            const funcName = getFunctionName();
            const prefix = `[${funcName}]`;
            logger[level](prefix, ...args);
        };
    }

    return wrapped;
}



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

const rawLogger = log4js.getLogger("server");
const rawDbLogger = log4js.getLogger("db");
const rawApiLogger = log4js.getLogger("api");
const rawFileLogger = log4js.getLogger("file");
const rawCharLogger = log4js.getLogger("char");

const logger = wrapLogger(rawLogger);
const dbLogger = wrapLogger(rawDbLogger);
const apiLogger = wrapLogger(rawApiLogger);
const fileLogger = wrapLogger(rawFileLogger);
const charLogger = wrapLogger(rawCharLogger);


export { logger, dbLogger, apiLogger, fileLogger, charLogger };