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
          APIList: {
              name,
              endpoint,
              key,
              type,
              claude,
              value              //this is a copy of 'name' for selector population purposes
            },
          selectedAPI,          //just the name
          isAutoResponse,     //boolean for checkbox
      },
      APIConfig: {
              name,               //string
              endpoint,           //string
              key,                //string
              type,               //selector value,
              claude,             //checkbox
              selectedModel,      //selector value, matches an item from the modelList below
              modelList: {}       //list for a selector
          },
      },
      crowdControl: {
          userChatDelay,      //number input value
          AIChatDelay,           //number input value
      },
  ]
*/

import util from "./utils.js";
import control from "./controls.js";
import { myUUID } from "../script.js";

var liveConfig, APIConfig, liveAPI, promptConfig, crowdControl
var initialLoad = true

async function processLiveConfig(configArray) {

  if (configArray.liveConfig) {
    liveConfig = configArray.liveConfig;  //for the first time reception
  } else {
    liveConfig = configArray.value //for everytime after that.
  }

  // Process promptConfig
  const {
    selectedCharacter, cardList,
    selectedInstruct, instructList,
    selectedSamplerPreset, samplerPresetList,
    APIList, selectedAPI,
    responseLength, contextSize, isStreaming, isAutoResponse, engineMode,
    systemPrompt, D4AN, D4CharDefs, D1JB,
  } = liveConfig.promptConfig

  //Process APIConfig
  liveAPI = liveConfig.promptConfig.APIList.find(api => api.name === selectedAPI)
  APIConfig = liveConfig.APIConfig
  promptConfig = liveConfig.promptConfig
  crowdControl = liveConfig.crowdControl

  //console.log(liveAPI)
  //console.log(APIConfig)
  //console.log(promptConfig)
  //console.log(crowdControl)

  const { userChatDelay, AIChatDelay } = liveConfig.crowdControl;


  setEngineMode(engineMode);

  await populateSelector(cardList, "cardList", selectedCharacter);
  await populateSelector(APIList, "APIList", selectedAPI);
  await populateSelector(samplerPresetList, "samplerPresetList", selectedSamplerPreset);
  await populateSelector(instructList, "instructList", selectedInstruct);

  await populateInput(selectedAPI, "selectedAPI");

  await selectFromPopulatedSelector(responseLength, "responseLength");
  await selectFromPopulatedSelector(contextSize, "contextSize");
  await toggleCheckbox(isAutoResponse, "isAutoResponse");
  await toggleCheckbox(isStreaming, "isStreaming");

  await populateInput(liveAPI.endpoint, "endpoint");
  await populateInput(liveAPI.key, "key");
  await selectFromPopulatedSelector(liveAPI.type, "type");
  await toggleCheckbox(liveAPI.claude, "claude");

  await populateInput(systemPrompt, "systemPrompt");
  await populateInput(D4AN, "D4AN");
  await toggleCheckbox(D4CharDefs, "D4CharDefs");
  await populateInput(D1JB, "D1JB");

  await populateInput(userChatDelay, "userChatDelay");
  await populateInput(AIChatDelay, "AIChatDelay");


  if (!APIConfig.modelList) {
    console.warn('Did not see a modelList for this API, clicking modelListButton to get one.')
    $("#modelLoadButton").trigger("click");
  } else { //problem: APIConfig.modeList will save the modelList from non-horde APIs, even if horde is the active engine mode
    //this is because EngineMode is part of promptConfig, not APIConfig
    //however APIConfig.SelectedModel DOES save the last selected horde model...so we can use that..

    //so here we prime the horde model list if it's selected, hoping that selectedModel exists within it still..
    if (engineMode === 'horde' && $("#hordeWorkerList option").length === 0) {
      console.warn('populating empty horde model list')
      await control.getModelList()
      console.warn(`selecting ${APIConfig.selectedModel} from horde model list which is no longer empty`)
      await util.delay(250)
      await selectFromPopulatedSelector(APIConfig.selectedModel, "hordeWorkerList")
      //console.log('clicking horde model button load')
      //$("#modelLoadButton").trigger("click");
    } else {

      await populateSelector(APIConfig.modelList, "modelList", APIConfig.selectedModel);
    }
  }



  initialLoad = false
}

/**
 * Populates a selector element with options based on a list of items.
 *
 * @param {Array} itemsObj - an array of items with 'value' and 'name' properties.
 * @param {string} elementID - The ID of the selector element.
 * @param {string} selectedValue - Optional. The value to select after the population is finished.
 * @returns {Promise} - A Promise that resolves once the selector element is populated and optionally selected.
 */
async function populateSelector(itemsObj, elementID, selectedValue = null) {
  return new Promise(async (resolve) => {
    // Skip validation for itemsObj since it's an array, not a single value
    if (!itemsObj || !Array.isArray(itemsObj)) {
      console.warn(`Error: Invalid itemsObj for ${elementID}`, itemsObj);
      await util.flashElement(elementID, 'bad');
      resolve();
      return;
    }

    //console.debug(`Populating selector ${elementID}`);
    const selectElement = $(`#${elementID}`);

    // Capture current value to preserve selection
    const currentValue = selectElement.val();

    // Clear and repopulate selector
    selectElement.empty();
    if (elementID === 'APIList') {
      selectElement.append($('<option>').val('addNewAPI').text('Add New API'));
    }
    if (elementID === 'hordeWorkerList') {
      selectElement.append($('<option>').val('NULL').text('Select a Horde model..'));
    }

    itemsObj.forEach((item) => {
      const newElem = $("<option>");
      newElem.val(item.value || item.name || item);
      newElem.text(item.name || item);
      selectElement.append(newElem);
    });

    // Restore previous selection if it exists in the new options
    if (currentValue && selectElement.find(`option[value="${currentValue}"]`).length) {
      selectElement.val(currentValue);
    }

    // Set the selected value if provided
    if (selectedValue) {
      await selectFromPopulatedSelector(selectedValue, elementID);
    }

    resolve();
  });
}

/**
 * Selects a value in a populated selector element.
 *
 * @param {string} value - The value to select.
 * @param {string} elementID - The ID of the selector element.
 * @returns {Promise} - A Promise that resolves once the value is selected.
 */
async function selectFromPopulatedSelector(value, elementID) {
  return new Promise(async (resolve) => {
    const shouldContinue = await checkArguments("selectFromPopulatedSelector", [value, elementID], true);
    if (!shouldContinue) {
      resolve();
      return;
    }

    const selectElement = $(`#${elementID}`);
    selectElement.val(value); // Set the value directly
    util.flashElement(elementID, "good");
    //console.debug(`Set ${elementID} to ${value}, current value is ${selectElement.val()}`);
    resolve();
  });
}

async function populateInput(value, elementID) {
  return new Promise(async (resolve) => {
    let shouldContinue = await checkArguments("populateInput", arguments)
    if (!shouldContinue) {
      resolve();
      return
    }

    $(`#${elementID}`).val(value);
    util.flashElement(elementID, "good");
    //console.debug(`confirming ${elementID} value is now ${$(`#${elementID}`).val()}`);
    resolve();
  })
}

async function toggleCheckbox(value, elementID) {
  return new Promise(async (resolve) => {
    let shouldContinue = await checkArguments("toggleCheckbox", arguments)
    if (!shouldContinue) {
      resolve();
      return
    }

    $(`#${elementID}`).prop("checked", value);
    util.flashElement(elementID, "good");
    resolve();
  });
}

/**
 * Validates arguments for DOM manipulation functions.
 *
 * @param {string} functionName - The name of the calling function.
 * @param {Array} args - The arguments passed to the function.
 * @param {boolean} isSelectorCheck - Whether to verify option existence for select elements.
 * @returns {Promise<boolean>} - True if arguments are valid and update is needed, false otherwise.
 */
async function checkArguments(functionName, args, isSelectorCheck = false) {
  const [value, elementID, selectedValue] = args;

  if (value === null || value === undefined) {
    console.warn(`Error: Invalid value for ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement(elementID, 'bad');
    return false;
  }

  if (elementID === null || elementID === undefined) {
    console.warn(`Error: Invalid elementID for ${functionName}!`, value, elementID, selectedValue);
    await util.flashElement('AIConfigWrap', 'bad');
    return false;
  }

  const elementExists = await verifyElementExists(elementID);
  if (!elementExists) {
    await util.flashElement('AIConfigWrap', 'bad');
    return false;
  }

  if (isSelectorCheck) {
    const optionExists = await verifyOptionExists(value, elementID);
    if (!optionExists) {
      await util.flashElement(elementID, 'bad');
      return false;
    }
  }

  const areValuesTheSame = await verifyValuesAreTheSame(value, elementID);
  if (areValuesTheSame) {
    //console.debug(`No update needed for ${elementID}: values are the same`);
    return false;
  }

  return true;
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

/**
 * Verifies if the current value of an element matches the provided value.
 *
 * @param {any} value - The value to compare.
 * @param {string} elementID - The ID of the element.
 * @returns {Promise<boolean>} - True if values are the same, false otherwise.
 */
async function verifyValuesAreTheSame(value, elementID) {
  const $element = $(`#${elementID}`);
  let elementValue;

  if ($element.is(':checkbox')) {
    elementValue = Boolean($element.prop('checked'));
    value = value === 'true' || value === true || value === 1; // Normalize to boolean
  } else if ($element.is('select')) {
    //console.debug('saw selector comparison for:', elementID);
    elementValue = String($element.val() || ''); // Use .val() for select, normalize to string
    value = String(value || '');
  } else {
    elementValue = String($element.val() || '');
    value = String(value || '');
  }

  //console.debug(`verifyValuesAreTheSame: ${elementID} | new: ${value} (${typeof value}) | current: ${elementValue} (${typeof elementValue})`);

  const result = elementValue === value;
  if (!result) {
    /*     console.debug(`Compared values for ${elementID}:
        New ${value}
        Current ${elementValue}
        Needs update!`); */
  }
  return result;
}

// set the engine mode to either horde or Text Completions based on a value from the websocket
async function setEngineMode(mode, hordeWorkerList = null) {
  // Check if the mode has changed
  if (liveConfig.promptConfig.engineMode === mode) {
    //console.debug(`No change in engineMode: ${mode}, skipping update`);
    return;
  }

  //console.debug("API MODE:", mode);
  liveConfig.promptConfig.engineMode = mode;
  const toggleModeElement = $("#toggleMode");
  const isHordeMode = mode === "horde";
  toggleModeElement
    .toggleClass("TCMode", !isHordeMode)
    .toggleClass("hordeMode", isHordeMode)
    .text(isHordeMode ? "🧟" : "📑")
    .attr("title", isHordeMode ? "Click to switch to Text Completions Mode" : "Click to switch to Horde Mode");

  console.log(`Switching to ${isHordeMode ? "Horde" : "Text Completions"} Mode`);

  util.flashElement("toggleMode", "good");

  if (isHordeMode) {
    $("#TCCCAPIBlock").hide();
    $("#isStreaming").prop('checked', false);
    $("#isStreamingChekboxBlock").hide();
    populateSelector(hordeWorkerList, 'hordeWorkerList');
    $("#hordeWorkerListBlock").show();
  } else {
    $("#hordeWorkerListBlock").hide();
    $("#TCCCAPIBlock").show();
    $("#isStreaming").prop('checked', liveAPI.isStreaming);
    $("#isStreamingChekboxBlock").show();
  }
}

function deleteAPI() {
  let APIToDelete = $("#APIList").children('option:selected').val();

  if (APIToDelete === 'Default' || APIToDelete === 'Add New API') {
    alert(`Cannot delete required options in this selector ('Default' and 'Add New API'!`)
    return
  }

  console.log(APIToDelete)
  let indexToDelete = liveConfig.promptConfig.APIList.findIndex(function (item) {
    return item.name === APIToDelete;
  });

  if (indexToDelete !== -1) {
    liveConfig.promptConfig.APIList.splice(indexToDelete, 1);
    liveConfig.promptConfig.selectedAPI = 'Default'
  }

  console.log(liveConfig.promptConfig.APIList)
  console.log(liveConfig.promptConfig.selectedAPI)

  $("#APIList").children('option[value="Default"]').prop('selected', true);
  updateConfigState($("#APIList"))
  util.betterSlideToggle($("#promptConfig"), 250, "height");
  util.betterSlideToggle($("#APIConfig"), 250, "height");
}

async function updateConfigState(element) {
  console.warn(liveConfig)
  //console.debug('LOCAL ENGINE MODE = ', liveConfig.promptConfig.engineMode)
  if (initialLoad) { return }

  let $element = element
  let elementID = $element.prop('id')

  let arrayName, propName, value

  if ($element.is('input[type=checkbox]')) {
    value = $element.prop('checked')
    if (value === 0) { value = false }
    if (value === 1) { value = true }
  }
  else { // selectors and text inputs
    value = $element.val()
  }

  if (elementID === 'cardList') {
    arrayName = 'promptConfig'
    propName = 'selectedCharacter'
    liveConfig['promptConfig']['selectedCharacterDisplayName'] = $element.find('option:selected').text()
  }
  else if ($element.is('select') && $element.hasClass('dynamicSelector')) {
    //console.log('dynamic selector')
    arrayName = elementID.replace('List', '');
    let arrayNameForParse = arrayName.charAt(0).toUpperCase() + arrayName.slice(1);
    arrayName = $element.closest('.isArrayType').prop('id') //this will resolve to either promptConfig or APIConfig, whichever the input element is inside of.
    propName = 'selected' + arrayNameForParse
    //ex: selector element "#modelList" existing inside the #promptConfig div
    //result: the selector's value is applied to "liveConfig.promptConfig.selectedModel"

  }
  else {
    //console.log('static selector, text field, or checkbox')
    propName = elementID
    arrayName = $element.closest('.isArrayType').prop('id')
  }

  //console.debug(`${arrayName}.${propName}: "${value}"`)

  liveConfig[arrayName][propName] = value

  let stateChangeMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }

  await util.flashElement(elementID, 'good')
  util.messageServer(stateChangeMessage)
}


$("#APIList").on("change", async function () {
  if ($(this).val() === "Default") {
    return;
  }

  //console.debug("[#apilist] changed");
  if ($(this).val() === "addNewAPI") {
    //console.debug('[#apilist]...to "addNewApi"');
    //clear all inputs for API editing
    $("#APIConfig input").val("");
    control.enableAPIEdit();
    //hide API config, show API edit panel.
    util.betterSlideToggle($("#promptConfig"), 250, "height");
    util.betterSlideToggle($("#APIConfig"), 250, "height");
    return;
  } else {
    //console.debug(`[#apilist]...to "${$(this).val()}"`);
    if ($("#APIConfig").css("display") !== "none") {
      util.betterSlideToggle($("#APIConfig"), 250, "height");
      control.hideAddNewAPIDiv();
    }
    if ($("#promptConfig").css("display") === "none") {
      util.betterSlideToggle($("#promptConfig"), 250, "height");
    }
  }
  liveConfig['promptConfig']['selectedAPI'] = $(this).val()
  let selectedAPI = liveConfig.promptConfig.selectedAPI
  liveConfig['APIConfig'] = liveConfig.promptConfig.APIList.find(api => api.name === selectedAPI)
  console.log(liveConfig.APIConfig)

  let stateChangeMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }

  util.messageServer(stateChangeMessage);
  util.flashElement("apiList", "good");
});

$("#promptConfig input, #promptConfig select:not(#APIList, #modelList), #cardList, #hordeWorkerList").on('change', function () { updateConfigState($(this)) })

$("#promptConfig textarea, #crowdControl input").on('change', function () {
  updateConfigState($(this))
})

async function addNewAPI() {
  //check each field for validity, flashElement if invalid
  console.debug('[addNewAPI()] >> GO')
  let name = $("#selectedAPI").val()
  let endpoint = $("#endpoint").val()
  let key = $("#key").val()
  let type = $("#type").val()
  let claude = $("#claude").prop('checked')

  if (name === '' || name === 'Default' || name === 'Add New API') {
    await util.flashElement('selectedAPI', 'bad')
    alert(`This name is reserved by system.`)
    return
  }

  if (endpoint.includes('localhost:')) {
    await util.flashElement('endpoint', 'bad')
    alert('For local connections use 127.0.0.1, not localhost')
    return
  }

  if (endpoint === '' || !util.isValidURL(endpoint)) {
    await util.flashElement('endpoint', 'bad')
    alert(`Invalid URL structure.`)
    return
  }

  let newAPI = {
    name: name,
    endpoint: endpoint,
    key: key,
    type: type,
    claude: claude,
  }

  let matchingAPI = liveConfig.promptConfig.APIList.findIndex(obj => obj.name === newAPI.name);

  if (matchingAPI !== -1) {
    // Replace the object at the found index with newAPI
    liveConfig.promptConfig.APIList[matchingAPI] = newAPI;
  } else {
    // Add newAPI to the array
    liveConfig.promptConfig.APIList.push(newAPI);
  }

  liveConfig.promptConfig.selectedAPI = name
  liveConfig.APIConfig = newAPI
  liveAPI = newAPI
  APIConfig = newAPI

  console.debug(APIConfig)
  console.debug(liveAPI)
  //console.debug(liveConfig.promptConfig.APIList)

  console.log('added new API to local liveConfig. Sending to server.')
  let newAPIMessage = {
    UUID: myUUID,
    type: 'clientStateChange',
    value: liveConfig
  }

  util.messageServer(newAPIMessage)

  await util.delay(250)
  //hide edit panel after save is done
  util.betterSlideToggle($("#APIConfig"), 250, 'height')
  util.betterSlideToggle($("#promptConfig"), 250, "height");
  control.disableAPIEdit()

}

export default {
  processLiveConfig,
  setEngineMode,
  addNewAPI,
  deleteAPI,
};
