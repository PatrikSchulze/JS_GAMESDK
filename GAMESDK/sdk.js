"use strict";
var ENDPOINT_DEV = "dev";
var ENDPOINT_STAGE = "stage";
var ENDPOINT_PRODUCTION = "production";
var Achievement = (function () {
    function Achievement() {
    }
    return Achievement;
}());
var Score = (function () {
    function Score() {
    }
    return Score;
}());
var SDK = (function () {
    function SDK() {
    }
    //Public members below
    SDK.init = function (userID, endPoint) {
        if (typeof userID !== 'number' || userID < 1) {
            this.log("INIT FAILURE: Provide a valid user ID. " + userID);
            return null;
        }
        this.switchUser(userID);
        if (endPoint.toLowerCase() === ENDPOINT_DEV) {
            this.switchEndPointToDev();
        }
        else if (endPoint.toLowerCase() === ENDPOINT_STAGE) {
            this.switchEndPointToStage();
        }
        else if (endPoint.toLowerCase() === ENDPOINT_PRODUCTION) {
            this.switchEndPointToProduction();
        }
        else {
            this.switchEndPointToDev();
        }
        // dev is default fallback, to switch endpoints the methods have to be called manually, after init
    };
    SDK.switchUser = function (userID) {
        if (typeof userID !== 'number' || userID < 1) {
            this.log("switchUser FAILURE: Provide a valid user ID. " + userID);
            return null;
        }
        this.addUserId(userID);
        this.pollScoreFromDB(userID);
        this.currentUserID = userID;
    };
    SDK.switchEndPointToDev = function () {
        this.currentEndPoint = ENDPOINT_DEV;
    };
    SDK.switchEndPointToProduction = function () {
        this.currentEndPoint = ENDPOINT_PRODUCTION;
    };
    SDK.switchEndPointToStage = function () {
        this.currentEndPoint = ENDPOINT_STAGE;
    };
    SDK.postScore = function (incomingScoreNum) {
        var score = this.getScoreFromCache(this.currentUserID);
        score.scorenum = incomingScoreNum;
        this.postScoreToDB(score);
        this.pollScoreFromDB(this.currentUserID);
    };
    SDK.getScore = function () {
        this.pollScoreFromDB(this.currentUserID);
        return this.getScoreFromCache(this.currentUserID);
    };
    // we could also update every single score here, network and performance argument
    SDK.getAllScores = function () {
        /*
        if (alsoUpdateAllScores) {
            for (let i = 0; i < this.allUserIDs.length; i++) {
                this.pollScoreFromDB(this.allUserIDs[i]);
            }
        }*/
        return this.scoreCache;
    };
    SDK.getTopScores = function (limit) {
        if (typeof limit !== 'number' || limit < 1)
            return null;
        var scores;
        scores = SDK.getAllScores();
        //sort all of them, DESC
        scores.sort(function (a, b) {
            return b.scorenum - a.scorenum;
        });
        var topTen;
        for (var i = 0; i < limit; i++) {
            topTen.push(scores[i]);
        }
        return topTen;
    };
    SDK.getAchievement = function (achievementID) {
        if (typeof achievementID !== 'number' || achievementID < 1)
            return null;
        this.pollAchievementFromDB(this.currentUserID, achievementID);
        return this.getAchievementFromCache(this.currentUserID, achievementID);
    };
    SDK.getAchievementProgress = function (achievementID) {
        if (typeof achievementID !== 'number' || achievementID < 1)
            return null;
        var achievement = this.getAchievement(achievementID);
        return { 'stepsComplete': achievement.stepsComplete, 'stepsTotal': achievement.stepsTotal };
    };
    SDK.getAchievementProgressString = function (achievementID) {
        if (typeof achievementID !== 'number' || achievementID < 1)
            return null;
        var achievement = this.getAchievement(achievementID);
        return "Achievement progress: " + achievement.stepsComplete + " out of " + achievement.stepsTotal;
    };
    // The backends has NO WAY of setting stepsTotal for an achievement
    // How this would work is just implied I guess and I will not worry about it.
    // Since I don't even have any option to set it in the DB.
    SDK.updateAchievement = function (achievementID, stepsComplete) {
        if (typeof achievementID !== 'number' || achievementID < 1)
            return;
        var achievement = this.getAchievementFromCache(this.currentUserID, achievementID);
        achievement.stepsComplete = stepsComplete;
        this.postAchievementToDB(achievement);
    };
    SDK.isAchievementUnlocked = function (achievementID) {
        if (typeof achievementID !== 'number' || achievementID < 1)
            return null;
        var progress = this.getAchievementProgress(achievementID);
        if (progress.stepsComplete >= progress.stepsTotal)
            return true;
        else
            return false;
    };
    //Private members below
    SDK.postScoreToDB = function (score) {
        var url = this.serverURL + this.currentEndPoint + this.urlPostScore;
        var params = "userId=" + score.userID + "&score=" + score.scorenum;
        var request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                SDK.pollScoreFromDB(score.userID);
            }
            if (request.status !== 200) {
                SDK.log('Status @ postScoreToDB: Request failed.  Returned status of ' + request.status + " for user: " + score.userID + " score: " + score.scorenum);
            }
        };
    };
    SDK.pollScoreFromDB = function (userID) {
        var url = this.serverURL + this.currentEndPoint + this.urlGetScore;
        var params = "userId=" + userID;
        var request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                // Doc says: Returns: { score: int, timestamp: int }
                var jsonResponse = JSON.parse(request.responseText);
                var score = void 0;
                score = SDK.getScoreFromCache(userID);
                score.scorenum = jsonResponse.score;
                score.timestamp = jsonResponse.timestamp;
            }
            if (request.status !== 200) {
                SDK.log('Status @ pollScoreFromDB: Request failed.  Returned status of ' + request.status + " for user: " + userID);
            }
        };
    };
    SDK.postAchievementToDB = function (inAchievement) {
        var url = this.serverURL + this.currentEndPoint + this.urlUpdateAchievement; //Params: userId: int, achievementId: int, stepsComplete: int
        var params = "userId=" + inAchievement.userID + "&achievementId=" + inAchievement.achievementID + "&stepsComplete=" + inAchievement.stepsComplete;
        var request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                SDK.pollAchievementFromDB(inAchievement.userID, inAchievement.achievementID);
            }
            if (request.status !== 200) {
                SDK.log('Status @ postAchievementToDB: Request failed.  Returned status of ' + request.status + " for user: " + inAchievement.userID + " achievementID: " + inAchievement.achievementID);
            }
        };
    };
    SDK.pollAchievementFromDB = function (userID, achievementID) {
        var url = this.serverURL + this.currentEndPoint + this.urlGetAchievement; // Params:  userId:  int,  achievementId: int
        var params = "userId=" + userID + "&achievementId=" + achievementID;
        var request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                // Doc says: Returns: { stepsComplete: int, stepsTotal: int }
                var jsonResponse = JSON.parse(request.responseText);
                var achievement = void 0;
                achievement = SDK.getAchievementFromCache(userID, achievementID);
                achievement.stepsComplete = jsonResponse.stepsComplete;
                achievement.stepsTotal = jsonResponse.stepsTotal;
            }
            if (request.status !== 200) {
                SDK.log('Status @ pollAchievementFromDB: Request failed.  Returned status of ' + request.status + " for user: " + userID + " achievementID: " + achievementID);
            }
        };
    };
    SDK.ajaxGet = function (params, url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + "?" + params, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(null);
        return xhr;
    };
    SDK.ajaxPost = function (params, url) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(params);
        return xhr;
    };
    SDK.getScoreFromCache = function (userID) {
        var outScore = null;
        for (var i = 0; i < this.scoreCache.length; i++) {
            if (this.scoreCache[i].userID === userID) {
                outScore = this.scoreCache[i];
            }
        }
        if (outScore == null) {
            outScore = this.pokeScoreEntry(userID);
        }
        return outScore;
    };
    SDK.pokeScoreEntry = function (userID) {
        // if a user has no score in the cache, we shall poke a zero one in there, 
        // so that we have a object/ index to write the actual score into later.This is its slot.
        var emptyScore;
        emptyScore.userID = userID;
        emptyScore.timestamp = 0;
        emptyScore.scorenum = 0;
        return emptyScore;
    };
    SDK.pokeAchievementEntry = function (userID, achievementID) {
        // same as scores
        var achievementPoke;
        achievementPoke.userID = userID;
        achievementPoke.achievementID = achievementID;
        achievementPoke.stepsComplete = 0;
        achievementPoke.stepsTotal = 0;
        return achievementPoke;
    };
    SDK.getAchievementFromCache = function (userID, achievementID) {
        var achievement = null;
        for (var i = 0; i < this.achievementCache.length; i++) {
            if (this.achievementCache[i].userID === userID && this.achievementCache[i].achievementID === achievementID) {
                achievement = this.achievementCache[i];
            }
        }
        if (achievement == null) {
            achievement = this.pokeAchievementEntry(userID, achievementID);
        }
        return achievement;
    };
    // adds user id to our array of all userids if it doesnt exist
    SDK.addUserId = function (userID) {
        for (var id in this.allUserIDs) {
            if (Number(id) === userID) {
                return;
            }
        }
        this.allUserIDs.push(userID);
    };
    SDK.log = function (data) {
        console.log(data);
    };
    SDK.serverURL = "127.0.0.1/"; //"http://someserver.com/";
    SDK.urlAPIPrefix = "/api/v1/";
    SDK.urlPostScore = SDK.urlAPIPrefix + "postScore";
    SDK.urlGetScore = SDK.urlAPIPrefix + "getScore";
    SDK.urlUpdateAchievement = SDK.urlAPIPrefix + "updateAchievement";
    SDK.urlGetAchievement = SDK.urlAPIPrefix + "getAchievement";
    return SDK;
}());
exports.SDK = SDK;
//# sourceMappingURL=sdk.js.map