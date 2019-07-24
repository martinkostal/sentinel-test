//VERSION=2
var numberOfMonthsToUse = 1;

function setup(ds) {
    return {
        components: [ds.B01, ds.B02, ds.B03, ds.B04, ds.B05, ds.B06, ds.B07, ds.B08, ds.B8A, ds.B11, ds.B12,
            ds.AOT, ds.CLD, ds.SNW, ds.SCL, ds.viewZenithMean, ds.viewAzimuthMean, ds.sunZenithAngles, ds.sunAzimuthAngles],
        output: [
            {
                id: "default",
                sampleType: SampleType.AUTO,
                componentCount: 3
            }
        ],
        temporal: true
    }
}

//function setup(ds) {
//    setInputComponents([ds.B01, ds.B02, ds.B03, ds.B04, ds.B05, ds.B06, ds.B07, ds.B08, ds.B8A, ds.B11, ds.B12,
//            ds.AOT, ds.CLD, ds.SNW, ds.SCL, ds.viewZenithMean, ds.viewAzimuthMean, ds.sunZenithAngles, ds.sunAzimuthAngles]);
//    setOutputComponentCount(3);
//}


function filterScenes (scenes, inputMetadata) {  
  return scenes.filter(function (scene) {
    var allowedDates = [
          "2018-02-21",
          "2018-02-13",
          "2018-02-06",
          "2018-02-03"];
    // format scene date timestamp to match allowed dates 
    var sceneDateStr = dateformat(scene.date);
    if (allowedDates.indexOf(sceneDateStr)!= -1) return true;
    else return false;
    });
}


function dateformat(d){  
  var dd = d.getDate();
  var mm = d.getMonth()+1;
  var yyyy = d.getFullYear();
  if(dd<10){dd='0'+dd}
  if(mm<10){mm='0'+mm}
  var isodate = yyyy+'-'+mm+'-'+dd;
  return isodate;
}


function evaluatePixel(samples, scenes) {
    var filteredSamples = filterByOrbitId(samples, scenes);
    var best = selectRepresentativeSample(filteredSamples);
    if (best === undefined) {
        return {default: [150, 150, 150]};
    } else {
        var bestSample = best.sample;
        var mos;
        var sampleIndex = samples.indexOf(bestSample);
        if (isNaN(best.mos)) {
            mos = 65535;
        } else {
            mos = best.mos * 10000;
        }
        return {default: [
                bestSample.B04 * 2.5,
                bestSample.B03 * 2.5,
                bestSample.B02 * 2.5
            ]};
    }
}

// Utils
function toUInt16(value) {
    return Math.max(0, Math.min(value * 10000, 65535));
}

function filterByOrbitId(samples, scenes) {
    var orbitId = -1;
    
    return samples
        .map(function (sample, i){
                return {s: sample, orbitId: scenes[i].orbitId, tileId: scenes[i].tileId};
            })
        .filter(e => e.s.SCL > 0)
        .sort(function(a, b) {
                if (a.orbitId < b.orbitId) return 1;
                if (a.orbitId > b.orbitId) return -1;

                if (a.tileId < b.tileId) return 1;
                if (a.tileId > b.tileId) return -1;
                return 0;
            })
        .filter(function(e) {
            if (e.orbitId !== orbitId) {
                orbitId = e.orbitId;
                return true;
            } else {
                return false;
            }
            })
        .map(e => e.s);
}

// Mosaic
const minSamplesForMedoid = 4;

function selectRepresentativeSample(samples) {
    var n = samples.length;
    var validSamples = samples.filter(validate);
    var validSamplesNum = validSamples.length;

    if (validSamplesNum == 0) {
        return undefined;
    }

    if (validSamplesNum == 1) {
        return {sample: validSamples[0], mos: NaN, valid_obs: 1};
    }

    if (validSamplesNum >= minSamplesForMedoid) {
        return performMedoid(validSamples);
    } else {
        return performStc(validSamples);
    }
}

function performMedoid(samples) {
    var medoid = computeMedoidIndex(samples);
    return {sample: samples[medoid.index], mos: medoid.spread, valid_obs: samples.length};
}

function performStc(samples) {
    var bestSample = samples[0];
    for (var i = 1; i < samples.length; i++) {
        bestSample = computeStc(samples[i], bestSample);
    }
    return {sample: bestSample, mos: NaN, valid_obs: samples.length};
}

// Validate
function validate(sample) {
    return validateSCL(sample.SCL) && validateViewZenithMean(sample.viewZenithMean);
}

function validateSCL(scl) {
    return scl == 2 || scl == 4 || scl == 5 || scl == 6 || scl == 11;
}

function validateViewZenithMean(vzm) {
    return vzm < 11;
}

function validateSamples(samples) {
    return samples.every(validateSample);
}

function validateSample(sample) {
    return !isNaN(sample) && isFinite(sample);
}

// STC
function computeNdvi(sample) {
    return (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
}

function computeVisualBandsSum(sample) {
    return sample.B02 + sample.B03 + sample.B04;
}

function computeSWIRMean(sample) {
    return (sample.B11 + sample.B12) / 2;
}

function computeNdwi(sample) {
    return (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
}

function computeStc(sampleA, sampleB) {
    var keySwitch = sampleA.SCL * 100 + sampleB.SCL;
    switch (keySwitch) {
        //Vegetation
        case 404:
            var ndviSampleA = computeNdvi(sampleA);
            var ndviSampleB = computeNdvi(sampleB);

            if (ndviSampleA > ndviSampleB && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                if (ndviSampleA < ndviSampleB && sampleA.CLD <= sampleB.CLD) {
                    return sampleA;
                } else {
                    return sampleB;
                }
            }
            break;
        case 405:
        case 504:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB) && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 400:
        case 401:
        case 402:
        case 403:
        case 406:
        case 407:
        case 408:
        case 409:
        case 410:
        case 411:
            return sampleA;
            break;
        case 4:
        case 104:
        case 204:
        case 304:
        case 604:
        case 704:
        case 804:
        case 904:
        case 1004:
        case 1104:
            return sampleB;
            break;
        //BARE_SOIL_DESERT
        case 505:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB) && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 500:
        case 501:
        case 502:
        case 503:
        case 506:
        case 507:
        case 508:
        case 509:
        case 510:
        case 511:
            return sampleA;
            break;
        case 5:
        case 105:
        case 205:
        case 305:
        case 605:
        case 705:
        case 805:
        case 905:
        case 1005:
        case 1105:
            return sampleB;
            break;
        //SNOW_ICE
        case 1111:
            if (computeVisualBandsSum(sampleA) > computeVisualBandsSum(sampleB) && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 1100:
        case 1101:
        case 1102:
        case 1103:
        case 1106:
        case 1107:
        case 1108:
        case 1109:
        case 1110:
            return sampleA;
            break;
        case 11:
        case 111:
        case 211:
        case 311:
        case 611:
        case 711:
        case 811:
        case 911:
        case 1011:
            return sampleB;
            break;
        //Water
        case 606:
            if ((computeNdwi(sampleA) > computeNdwi(sampleB) || computeSWIRMean(sampleA) < computeSWIRMean(sampleB)) &&
                    sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 600:
        case 601:
        case 602:
        case 603:
        case 607:
        case 608:
        case 609:
        case 610:
            return sampleA;
            break;
        case 6:
        case 106:
        case 206:
        case 306:
        case 706:
        case 806:
        case 906:
        case 1006:
            return sampleB;
            break;
        //DARK_FEATURE_SHADOW
        case 202:
            if (computeVisualBandsSum(sampleA) > computeVisualBandsSum(sampleB) && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 200:
        case 201:
        case 203:
        case 207:
        case 208:
        case 209:
        case 210:
            return sampleA;
            break;
        case 2:
        case 102:
        case 302:
        case 702:
        case 802:
        case 902:
        case 1002:
            return sampleB;
            break;
        //CLOUD_SHADOW
        case 303:
            if (computeVisualBandsSum(sampleA) > computeVisualBandsSum(sampleB) && sampleA.CLD <= sampleB.CLD) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 300:
        case 301:
        case 307:
        case 308:
        case 309:
        case 310:
            return sampleA;
            break;
        case 3:
        case 103:
        case 703:
        case 803:
        case 903:
        case 1003:
            return sampleB;
            break;
        //CLOUD_LOW_PROBA
        case 707:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB)) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 700:
        case 701:
        case 708:
        case 709:
        case 710:
            return sampleA;
            break;
        case 7:
        case 107:
        case 807:
        case 907:
        case 1007:
            return sampleB;
            break;
        //THIN_CIRRUS
        case 1010:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB)) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 1000:
        case 1001:
        case 1008:
        case 1009:
            return sampleA;
            break;
        case 10:
        case 110:
        case 810:
        case 910:
            return sampleB;
            break;
        //CLOUD_MEDIUM_PROBA
        case 808:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB)) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 800:
        case 801:
        case 809:
            return sampleA;
            break;
        case 8:
        case 108:
        case 908:
            return sampleB;
            break;
        //CLOUD_HIGH_PROBA
        case 909:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB)) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 900:
        case 901:
            return sampleA;
            break;
        case 9:
        case 109:
            return sampleB;
            break;
        //SATURATED_DEFECTIVE
        case 101:
            if (computeVisualBandsSum(sampleA) < computeVisualBandsSum(sampleB)) {
                return sampleA;
            } else {
                return sampleB;
            }
            break;
        case 100:
            return sampleA;
            break;
        case 1:
            return sampleB;
            break;
        default:
            return undefined;
    }
}

// Medoid
function distance(a, b) {
    var ret = 0;
    ret += Math.pow(a.B02-b.B02, 2);
    ret += Math.pow(a.B03-b.B03, 2);
    ret += Math.pow(a.B04-b.B04, 2);
    ret += Math.pow(a.B06-b.B06, 2);
    ret += Math.pow(a.B08-b.B08, 2);
    ret += Math.pow(a.B11-b.B11, 2);
    ret += Math.pow(a.B12-b.B12, 2);
    return Math.sqrt(ret);
}

function computeMedoidIndex(samples) {
    var n = samples.length;
    var d = createDistanceMatrix(samples);
    
    var distanceRow;
    var distanceSum;
    var distanceSumMin = Number.POSITIVE_INFINITY;
    var medoidIndex = -1;
    for (var j = 0; j < n; j++) {
        distanceRow = d[j];
        distanceSum = 0.0;
        for (var i = 0; i < n; i++) {
            distanceSum += distanceRow[i];
        }
        if (distanceSum < distanceSumMin) {
            distanceSumMin = distanceSum;
            medoidIndex = j;
        }
    }
    return {index: medoidIndex, spread: distanceSumMin / n};
}

function createDistanceMatrix(samples) {
    var n = samples.length;
    var d = createArray(n, n);
    for (var i = 0; i < n; i++) {
        var a = samples[i];
        for (var j = i + 1; j < n; j++) {
            var b = samples[j]
            d[i][j] = d[j][i] = distance(a, b);
        }
        d[i][i] = 0;
    }
    return d;
}

function createArray(length) {
    var arr = new Array(length || 0),
        i = length;

    if (arguments.length > 1) {
        var args = Array.prototype.slice.call(arguments, 1);
        while(i--) arr[length-1 - i] = createArray.apply(this, args);
    }

    return arr;
}
