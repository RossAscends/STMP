var log4js = require("log4js");
var logger = log4js.getLogger();

//set logging to the env variable, or default to INFO
logger.level = process.env.LOG_LEVEL || "INFO";

//export the logger
module.exports = logger;