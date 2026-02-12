import * as satellite from "satellite.js";

// Speed of Light in km/s
const SOL = 299792.458;
// Earth's angular velocity in rad/s
const EARTH_ROTATION_RATE = 7.2921159e-5;

/**
 * Parses frequency string from Palewire DB
 * Supports:
 * - Single: "435.100" -> 435100000
 * - Range: "435.100-435.150" -> 435125000 (Center)
 * - Split: "435.100/145.900" -> 435100000 (First)
 * - Units: Assumes MHz input strings
 *
 * @param {string|number} freqStr
 * @returns {number|null} Frequency in Hz, or null if invalid
 */
export const parseFrequency = (freqStr) => {
    if (!freqStr) return null;
    if (typeof freqStr === "number") return freqStr; // Already parsed (e.g. integer Hz)

    // Clean string
    let str = String(freqStr)
        .trim()
        .replace(/[^\d.\-\/]/g, "");

    // Handle Splits "/"
    if (str.includes("/")) {
        str = str.split("/")[0]; // Take first option
    }

    // Handle Ranges "-"
    if (str.includes("-")) {
        const parts = str.split("-").map(parseFloat);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            // Return center frequency
            return Math.round(((parts[0] + parts[1]) / 2) * 1000000);
        }
    }

    // Handle Single Value
    const val = parseFloat(str);
    if (!isNaN(val)) {
        return Math.round(val * 1000000);
    }

    return null;
};

/**
 * Calculates Range Rate (Relative Velocity) in km/s
 * Positive = Moving Away (Red Shift)
 * Negative = Moving Towards (Blue Shift)
 *
 * @param {Object} positionAndVelocity - Satellite PV from propagate() { position: {x,y,z}, velocity: {x,y,z} }
 * @param {Object} observerGd - Observer Geodetic { latitude, longitude, height } (radians, km)
 * @param {Date} date - Time of calculation
 * @returns {number} Range Rate (km/s)
 */
export const calculateRangeRate = (positionAndVelocity, observerGd, date) => {
    if (!positionAndVelocity.position || !positionAndVelocity.velocity) return 0;

    const satPos = positionAndVelocity.position;
    const satVel = positionAndVelocity.velocity;

    // 1. Calculate Observer ECI Position
    const gmst = satellite.gstime(date);
    const obsPos = satellite.geodeticToEcf(observerGd);
    const obsPosEci = satellite.ecfToEci(obsPos, gmst);

    // 2. Calculate Observer ECI Velocity (Earth Rotation)
    // V = Omega x R
    // Omega vector = [0, 0, w]
    // V = [-w*y, w*x, 0]
    const obsVelEci = {
        x: -EARTH_ROTATION_RATE * obsPosEci.y,
        y: EARTH_ROTATION_RATE * obsPosEci.x,
        z: 0,
    };

    // 3. Relative Position & Velocity Vectors
    const rRel = {
        x: satPos.x - obsPosEci.x,
        y: satPos.y - obsPosEci.y,
        z: satPos.z - obsPosEci.z,
    };

    const vRel = {
        x: satVel.x - obsVelEci.x,
        y: satVel.y - obsVelEci.y,
        z: satVel.z - obsVelEci.z,
    };

    // 4. Range (Magnitude of Relative Position)
    const range = Math.sqrt(rRel.x * rRel.x + rRel.y * rRel.y + rRel.z * rRel.z);

    // 5. Range Rate (Projection of V_rel onto R_rel)
    // v_r = (v_rel . r_rel) / |r_rel|
    const rangeRate =
        (vRel.x * rRel.x + vRel.y * rRel.y + vRel.z * rRel.z) / range;

    return rangeRate;
};

/**
 * Calculates Doppler Shift
 * @param {number} freqHz - Nominal Frequency in Hz
 * @param {number} rangeRateKms - Range Rate in km/s
 * @returns {number} Frequency Shift in Hz (Signed)
 */
export const calculateDopplerShift = (freqHz, rangeRateKms) => {
    // f_obs = f_src * (1 - v_r/c)
    // shift = f_obs - f_src = - f_src * (v_r/c)
    // Note: Standard formula often defines negative v_r as approaching.
    // Here, our rangeRate follows physics convention: Positive = Increasing Distance (Away).
    // Approaching (Negative RangeRate) -> Positive Doppler Shift (Higher Freq).
    // -1 * (-v) = +v -> freq increases. Correct.
    return -freqHz * (rangeRateKms / SOL);
};

/**
 * Formats a frequency with Doppler shift
 * @param {number} freq - Nominal freq
 * @param {number} shift - Doppler shift
 * @returns {string} Formatted string (e.g. "435.105.200")
 */
export const formatDopplerFreq = (freq, shift = 0) => {
    const corrected = freq + shift;
    return (corrected / 1000000).toFixed(6);
};
