/* Handles everything related to the control panel.
Based on the following array sent from server:

  liveConfig = [
      promptConfig: {
          selectedCharacter,         //selector value, matches an item from the cardList below
          cardList: {                //selector value array list
              {value: './filepath/', name: 'string'},
          },                
          selectedPreset,         // selector value
          presetList: {           //selector value array list
              {value: './filepath/',name:'string'},
          }
          instructFormat,          //selector value
          instructList: {          //selector value array list
              {value: './filepath/',name:'string'},
          }
          responseLength,         //selector value
          contextSize,            //selector value
          isStreaming,            //checkbox
          systemPrompt,           //text field value
          D4AN,                   //text field value
          D4CharDefs,             //checkbox boolean
          D1JB,                   //text field value
      },
      APIConfig: {
          engineMode,         //string
          APIList: {
              name,
              endpoint,
              key,
              type,
              claude,
              value
            },
          }
          selectedAPI: {
              selectedAPI,        //selector value, matches the value of one of the 'name' props in above APIList
              endpoint,           //string
              key,                //string
              endpointType,       //selector value
              claude,             //checkbox
              selectedModel,      //selector value, matches an item from the modelList below
              modelList: {}        //list for a selector
          },
      },
      crowdControl: {
          userChatDelay,      //number input value
          AIChatDelay,           //number input value
          isAutoResponse,     //boolean for checkbox
      },
  ]
*/

import util from "./utils.js";

async function processLiveConfig(liveConfig) {
  const { promptConfig, APIConfig, crowdControl } = liveConfig;

  // Process promptConfig

  const {
    selectedCharacter, cardList,
    selectedInstruct, instructList,
    selectedSamplerPreset, samplerPresetList,
    APIList,
    responseLength, contextSize, isStreaming, isAutoResponse, engineMode,
    systemPrompt, D4AN, D4CharDefs, D1JB,
  } = promptConfig || {};

  //Process APIConfig
  const { selectedAPI, liveAPI, selectedModel, modelList } = APIConfig || {};

  // Process crowdControl
  const { userChatDelay, AIChatDelay } = crowdControl;

  setEngineMode(engineMode);

  await populateSelector(cardList, "characters", selectedCharacter);
  await populateSelector(samplerPresetList, "samplerPreset", selectedSamplerPreset);
  await populateSelector(instructList, "instructStyle", selectedInstruct);

  await selectFromPopulatedSelector(responseLength, "responseLength");
  await selectFromPopulatedSelector(contextSize, "maxContext");
  await toggleCheckbox(isAutoResponse, "AIAutoResponse");
  await toggleCheckbox(isStreaming, "streamingCheckbox");

  await populateInput(systemPrompt, "systemPromptInput");
  await populateInput(D4AN, "D4ANInput");
  await toggleCheckbox(D4CharDefs, "D4CharDefs");
  await populateInput(D1JB, "D1JBInput");

  await populateInput(userChatDelay, "UserChatInputDelay");
  await populateInput(AIChatDelay, "AIChatInputDelay");

  await populateSelector(APIList, "apiList", selectedAPI);
  await populateInput(selectedAPI, "newAPIName");
  await populateInput(liveAPI.endpoint, "newAPIEndpoint");
  await populateInput(liveAPI.key, "newAPIKey");
  await selectFromPopulatedSelector(liveAPI.type, "newAPIEndpointType");
  await toggleCheckbox(liveAPI.claude, "isClaudeCheckbox");

  if (!modelList) {
    $("#modelLoadButton").trigger("click");
    console.log("did not see modelList, clicking the button to get it");
  } else {
    await populateSelector(modelList, "modelList", selectedModel);
  }
}

/**
 * Populates a selector element with options based on a list of items.
 *
 * @param {Array} itemsObj - an array of items with 'value' and 'name' properties.
 * @param {string} elementId - The ID of the selector element.
 * @param {string} selectedValue - Optional. The value to select after the population is finished.
 * @returns {Promise} - A Promise that resolves once the selector element is populated and optionally selected.
 */
async function populateSelector(itemsObj, elementID, selectedValue = null) {
  return new Promise(async (resolve) => {
    checkArguments("populateSelector", arguments) === true ? undefined : () => { resolve(); return }

    console.debug(itemsObj);
    console.debug(`is this an array for ${elementID}? ${Array.isArray(itemsObj)}`);

    const selectElement = $(`#${elementID}`);
    selectElement.empty();
    itemsObj.forEach((item) => {
      const newElem = $("<option>");
      newElem.val(item.value);
      newElem.text(item.name);
      selectElement.append(newElem);
    });

    if (selectedValue) {
      await selectFromPopulatedSelector(selectedValue, elementID);
      util.flashElement(elementID, "good");
    }

    resolve();
  });
}

async function selectFromPopulatedSelector(value, elementID) {
  return new Promise(async (resolve) => {
    checkArguments("selectFromPopulatedSelector", arguments, true) === true ? undefined : () => { resolve(); return }

    const selectElement = $(`#${elementID}`);
    selectElement.val(value).trigger("input");
    console.debug(`confirming ${elementID} value is now ${selectElement.val()}`);
    util.flashElement(elementID, "good");
    resolve();
  });
}

/**
 * Fills a specific text input field with a string.
 *
 * @param {string} value  - the string being inserted into the text input field
 * @param {string} elementID - the ID of the text field.
 */
async function populateInput(value, elementID) {
  return new Promise(async (resolve) => {
    checkArguments("populateInput", arguments) === true ? undefined : () => { resolve(); return }

    $(`#${elementID}`).val(value);
    util.flashElement(elementID, "good");
    console.debug(`confirming ${elementID} value is now ${$(`#${elementID}`).val()}`);
    resolve();
  })
}

/**
 * toggles a checkbox's state based on passed boolean arg
 *
 * @param {boolean} value - true or false
 * @param {string} elementID - the checkbox ID
 */
async function toggleCheckbox(value, elementID) {
  return new Promise(async (resolve) => {
    checkArguments("toggleCheckbox", arguments) === true ? undefined : () => { resolve(); return }

    $(`#${elementID}`).prop("checked", value);
    util.flashElement(elementID, "good");
    resolve();
  });
}

async function verifyElementExists(elementID) {
  const $element = $(`#${elementID}`);
  if (!$element.length) {
    console.warn("ERROR: Could not find element called:", elementID);
    await util.flashElement("AIConfigWrap", "bad");
    return false;
  }
  return true;
}

async function verifyOptionExists(optionValue, elementID) {
  const $element = $(`#${elementID}`);

  const options = $element.find("option");
  const optionExists = options.toArray().some((option) => option.value === optionValue);

  if (!optionExists) {
    console.warn(`ERROR: Option with value ${optionValue} didn't exist in ${elementID}!`);
    await util.flashElement(elementID, "bad");
    return false;
  }
  return true;
}

async function verifyValuesAreTheSame(value, elementID) {
  const $element = $(`#${elementID}`);
  let elementValue;

  if ($element.is(':checkbox')) {
    elementValue = Boolean($element.prop('checked'));
  } else {
    elementValue = $element.val();
  }

  console.debug(`Comparing values for ${elementID}: "${value}" - VS - "${elementValue}"`);
  return elementValue === value;
}

async function checkArguments(functionName, args, isSelectorCheck = false) {
  const [value, elementID, selectedValue] = args;

  if (value === null || value === undefined) {
    console.warn(`Error: Invalid arguments for function ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement(elementID, 'bad');
    return false;
  }

  if (elementID === null || elementID === undefined) {
    console.warn(`Error: Invalid arguments for function ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement('AIConfigWrap', 'bad');
    return false;
  }

  const elementExists = await verifyElementExists(elementID);
  if (!elementExists) {
    return false;
  }

  if (isSelectorCheck) {
    const optionExists = await verifyOptionExists(value, elementID);
    if (!optionExists) {
      return false;
    }
  }

  if (selectedValue !== undefined) {
    const areValuesTheSame = await verifyValuesAreTheSame(selectedValue, elementID);
    return !areValuesTheSame;
  }

  return true;
}

// set the engine mode to either horde or Text Completions based on a value from the websocket
async function setEngineMode(mode) {
  console.log("API MODE:", mode);
  const toggleModeElement = $("#toggleMode");
  const isHordeMode = mode === "horde";
  toggleModeElement
    .toggleClass("TCMode", !isHordeMode)
    .toggleClass("hordeMode", isHordeMode)
    .text(isHordeMode ? "🧟" : "📑")
    .attr("title", isHordeMode ? "Click to switch to Text Completions Mode" : "Click to switch to Horde Mode");

  console.log(
    `Switching to ${isHordeMode ? "Horde" : "Text Completions"} Mode`
  );
  util.flashElement("toggleMode", "good");
  if (isHordeMode) {
    $("#TCCCAPIBlock").hide();
    $("#streamingChekboxBlock").hide();
  } else {
    $("#TCCCAPIBlock").show();
    $("#streamingChekboxBlock").show();
  }
}

export default {
  processLiveConfig,
  setEngineMode,
};
