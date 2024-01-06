const fs = require('fs');

const extract = require('png-chunks-extract');
const PNGtext = require('png-chunk-text');
const { charLogger: logger } = require('./log.js');

const parse = async (cardUrl, format) => {
    let fileFormat = format === undefined ? 'png' : format;

    switch (fileFormat) {
        case 'png': {
            const buffer = fs.readFileSync(cardUrl);
            const chunks = extract(buffer);

            const textChunks = chunks.filter(function (chunk) {
                return chunk.name === 'tEXt';
            }).map(function (chunk) {
                return PNGtext.decode(chunk.data);
            });
            //logger.trace('textChunks in CCP.js')
            //logger.trace(textChunks)

            if (textChunks.length === 0) {
                logger.error('PNG metadata does not contain any character data.');
                throw new Error('No PNG metadata.');
            }
            return Buffer.from(textChunks[0].text, 'base64').toString('utf8');
        }
        default:
            break;
    }
};

module.exports = {
    parse: parse,
};
