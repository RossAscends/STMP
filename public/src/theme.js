import util from "./utils.js";

const throttledAdjust = await util.throttle(adjust, 250); // 100ms interval

//used to prefill the UI inputs on pageload

const defaultRootStyles = getComputedStyle(document.documentElement);

let themeOnLoad = util.getLocalStorage('theme');
let baseHueDefault, baseSatDefault, baseLightDefault


if (themeOnLoad) {
    baseHueDefault = themeOnLoad.baseHue
    baseSatDefault = themeOnLoad.baseSat
    baseLightDefault = themeOnLoad.baseLight


} else {
    baseHueDefault = parseInt(defaultRootStyles.getPropertyValue('--baseHue').trim())
    baseSatDefault = parseInt(defaultRootStyles.getPropertyValue('--baseSat').trim())
    baseLightDefault = parseInt(defaultRootStyles.getPropertyValue('--baseLight').trim())
}


async function adjust(type, value) {
    console.warn(`Adjusting ${type} by ${value}`);
    const root = document.documentElement;
    const rootStyles = getComputedStyle(root);

    let baseHue = parseInt(rootStyles.getPropertyValue('--baseHue').trim())
    let baseSat = parseInt(rootStyles.getPropertyValue('--baseSat').trim())
    let baseLight = parseInt(rootStyles.getPropertyValue('--baseLight').trim())

    const newValue = parseInt(value);

    // Update base values based on UI input
    switch (type) {
        case 'hue':
            baseHue = newValue;
            root.style.setProperty('--baseHue', baseHue);
            break;
        case 'saturation':
            baseSat = newValue;
            root.style.setProperty('--baseSat', `${baseSat}%`);
            break;
        case 'lightness':
            baseLight = newValue;
            root.style.setProperty('--baseLight', `${baseLight}%`);
            break;
    }

    // List of derived variables and their lightness offsets
    const derivedVars = {
        '--themeNeg15': { saturationOffset: 0, lightnessOffset: -15, defaultLightness: 5, minLight: 0, maxLight: 65 },
        '--themeNeg10': { saturationOffset: 0, lightnessOffset: -10, defaultLightness: 10, minLight: 5, maxLight: 70 },
        '--themeNeg5': { saturationOffset: 0, lightnessOffset: -5, defaultLightness: 15, minLight: 5, maxLight: 80 },
        '--themeNeg2': { saturationOffset: 0, lightnessOffset: -2, defaultLightness: 20, minLight: 2, maxLight: 83 },

        '--themeColorBase': { saturationOffset: 0, lightnessOffset: 0, defaultLightness: 20, minLight: 0, maxLight: 100 },

        '--themePlus2': { saturationOffset: 0, lightnessOffset: 2, defaultLightness: 22, minLight: 4, maxLight: 98 },
        '--themePlus5': { saturationOffset: 0, lightnessOffset: 5, defaultLightness: 25, minLight: 7, maxLight: 95 },
        '--themePlus10': { saturationOffset: 0, lightnessOffset: 10, defaultLightness: 30, minLight: 12, maxLight: 90 },
        '--themePlus15': { saturationOffset: 0, lightnessOffset: 15, defaultLightness: 35, minLight: 17, maxLight: 85 },

        '--themePlus35': { saturationOffset: 0, lightnessOffset: 35, defaultLightness: 55, minLight: 5, maxLight: 90 },
        '--themePlus45': { saturationOffset: 0, lightnessOffset: 45, defaultLightness: 65, minLight: 15, maxLight: 95 },

        '--themeAccent': { saturationOffset: 25, lightnessOffset: 25, defaultLightness: 45, minLight: 25, maxLight: 65, },
        '--themeAccentBold': { saturationOffset: 45, lightnessOffset: 45, defaultLightness: 65, minLight: 25, maxLight: 65, },
        // Add more here if needed
    };

    // Function to wrap lightness
    function adjustedLightness(varName, base, satOffset, offset, defaultLightness, minLight, maxLight) {
        if (offset === 0) return base;

        const isBodyNoShadow = $("body").hasClass("noShadow");

        if (base > 30 && !isBodyNoShadow) $("body").addClass("noShadow");
        else if (base <= 30 && isBodyNoShadow) $("body").removeClass("noShadow");

        let light = base + offset;


        // Only reverse if the offset would push it out of bounds
        if (light < minLight || light > maxLight) {

            // Try reversing the polarity
            const wouldReversingBeUseful = base - offset > minLight && base - offset < maxLight;
            let reversed

            if (wouldReversingBeUseful) {
                reversed = base - offset;
                console.debug(`${varName}: offset ${offset} would result in ${light} (minlight: ${minLight}, maxlight: ${maxLight}), reversing to ${-offset} to get ${reversed} instead.`);

                if (reversed === baseLight) {
                    //give an adjustment of either +10 or -10 depending on baseLight being above or below 50
                    if (baseLight > 50) {
                        console.debug(`${varName} same as baseLight, giving -10 for result of ${reversed - 10}`);
                        reversed = reversed - 10;
                    } else {
                        console.debug(`${varName} same as baseLight, giving +10 for result of ${reversed + 10}`);
                        reversed = reversed + 10;
                    }
                }

            }

            if (reversed) return reversed;
            // If reversing was not useful, thus skipped, try clamping instead

            console.debug(`${varName}: Could not reverse, trying Clamp`)

            const baseDiffToMax = maxLight - base;
            const baseDiffToMin = minLight - base;
            const doesMaxContrastMoreToBase = Math.abs(baseDiffToMax) > Math.abs(baseDiffToMin);
            const isMaxTooContrasty = Math.abs(baseDiffToMax) > 50;
            const isMinTooContrasty = Math.abs(baseDiffToMin) > 50;

            //if (!doesMaxContrastMoreToBase) { console.debug(`${varName}: setting to minLight: ${minLight}`); return minLight; }
            if (doesMaxContrastMoreToBase && !isMaxTooContrasty) { console.debug(`${varName}: setting to maxLight: ${maxLight}`); return maxLight; }
            else if (!isMinTooContrasty) { console.debug(`${varName}: setting to minLight: ${minLight}`); return minLight; }
            else if (!isMaxTooContrasty) { console.debug(`${varName}: setting to maxLight: ${maxLight}`); return maxLight; }
            else if (isMaxTooContrasty && isMinTooContrasty) { console.debug(`${varName}: both Min/Max are too contrasty, setting to light: ${light}`); return light; }

        }
        // If within range, just return it
        console.debug(` ${varName}: base: ${base}, offset: ${offset}, minLight: ${minLight}, maxLight: ${maxLight}, RESULT: ${light}`);
        return light;
    }

    for (const [varName, { saturationOffset, lightnessOffset, defaultLightness, minLight, maxLight }] of Object.entries(derivedVars)) {
        const light = adjustedLightness(varName, baseLight, saturationOffset, lightnessOffset, defaultLightness, minLight, maxLight);
        const sat = baseSat + saturationOffset;
        const hsl = `hsl(${baseHue}, ${sat}%, ${light}%)`;
        root.style.setProperty(varName, hsl);


    }

    updatePlaceholderColor();
    //set the HTML meta 'theme-color' attribute to match --themeNeg10
    const themeNeg10 = root.style.getPropertyValue('--themeNeg10').trim();
    document.querySelector('meta[name="theme-color"]').setAttribute('content', themeNeg10);
    util.saveLocalStorage('theme', { 'baseHue': baseHue, 'baseSat': baseSat, 'baseLight': baseLight });
    console.info('saved theme: ', { 'baseHue': baseHue, 'baseSat': baseSat, 'baseLight': baseLight });

}

function updatePlaceholderColor() {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const themeNeg15 = computedStyle.getPropertyValue('--themeNeg15').trim();

    if (!themeNeg15) {
        console.warn('Missing CSS variable: --themeNeg15');
        return;
    }

    // Create or update a dedicated <style> block for placeholder styling
    let styleTag = document.getElementById('dynamic-placeholder-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-placeholder-style';
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
    input::placeholder,
    textarea::placeholder {
      color: ${themeNeg15};
    }
    input::-webkit-input-placeholder,
    textarea::-webkit-input-placeholder {
      color: ${themeNeg15};
    }
    input::-moz-placeholder,
    textarea::-moz-placeholder {
      color: ${themeNeg15};
    }
    input:-ms-input-placeholder,
    textarea:-ms-input-placeholder {
      color: ${themeNeg15};
    }
  `;
}

$(async function () {



    updatePlaceholderColor();

    $("#themeHue").val(baseHueDefault);
    $("#themeSaturation").val(baseSatDefault);
    $("#themeLightness").val(baseLightDefault);

    $("#themeHue, #themeSaturation, #themeLightness").off("change").on("change", async function () {
        const targetAdjustmentType = $(this).data("for");
        const elementID = $(this).attr("id");
        let value = $(this).val();

        //clamp appropriately in UI
        const maxValue = targetAdjustmentType !== 'hue' ? 100 : 360;
        if (value > maxValue) { util.flashElement(elementID, "bad"); await util.delay(500); value = maxValue; $(this).val(maxValue); }
        if (value < 0) { util.flashElement(elementID, "bad"); await util.delay(500); value = 0; $(this).val(0); }

        await throttledAdjust(targetAdjustmentType, value);
    });

    if (themeOnLoad) {
        $("#themeHue").val(baseHueDefault).trigger('change');
        await util.delay(250)
        $("#themeSaturation").val(baseSatDefault).trigger('change');
        await util.delay(250)
        $("#themeLightness").val(baseLightDefault).trigger('change');
    } else {
        console.warn('no theme found', themeOnLoad)
    }
})

export default { adjust };