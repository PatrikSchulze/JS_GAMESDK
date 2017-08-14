const ENDPOINT_DEV: string = "dev";
const ENDPOINT_STAGE: string = "stage";
const ENDPOINT_PRODUCTION: string = "production";

class Achievement {
    public userID: number;
    public achievementID: number;
    public stepsComplete: number;
    public stepsTotal: number;
}

class Score {
    public userID: number;
    public scorenum: number;
    public timestamp: number;
}

export class SDK {
    private static serverURL                = "127.0.0.1/"; //"http://someserver.com/";
    private static urlAPIPrefix             = "/api/v1/";
    private static urlPostScore             = SDK.urlAPIPrefix + "postScore";
    private static urlGetScore              = SDK.urlAPIPrefix + "getScore";
    private static urlUpdateAchievement     = SDK.urlAPIPrefix + "updateAchievement";
    private static urlGetAchievement        = SDK.urlAPIPrefix + "getAchievement";
    // these would be put in an array if we got many more of these

    private static currentUserID: number;
    private static allUserIDs: number[];

    private static scoreCache: Score[];
    private static achievementCache: Achievement[];

    private static serverEndPoints: string[];
    private static currentEndPoint: string;


    constructor() {
    }

    //Public members below

    public static init(userID: number, endPoint: string) {
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
    }

    public static switchUser(userID: number) {
        if (typeof userID !== 'number' || userID < 1) {
            this.log("switchUser FAILURE: Provide a valid user ID. " + userID);
            return null;
        }
        this.addUserId(userID);
        this.pollScoreFromDB(userID);
        this.currentUserID = userID;
    }

    public static switchEndPointToDev() {
        this.currentEndPoint = ENDPOINT_DEV;
    }

    public static switchEndPointToProduction() {
        this.currentEndPoint = ENDPOINT_PRODUCTION;
    }

    public static switchEndPointToStage() {
        this.currentEndPoint = ENDPOINT_STAGE;
    }

    public static postScore(incomingScoreNum: number) {

        let score = this.getScoreFromCache(this.currentUserID);
        score.scorenum = incomingScoreNum;
        this.postScoreToDB(score);

        this.pollScoreFromDB(this.currentUserID);
    }

    public static getScore():Score {
        this.pollScoreFromDB(this.currentUserID);
        return this.getScoreFromCache(this.currentUserID);
    }

    // we could also update every single score here, network and performance argument
    public static getAllScores(): Score[] {
        /*
        if (alsoUpdateAllScores) {
            for (let i = 0; i < this.allUserIDs.length; i++) {
                this.pollScoreFromDB(this.allUserIDs[i]);
            }
        }*/

        return this.scoreCache;
    }

    public static getTopScores(limit: number): Score[] {
        if (typeof limit !== 'number' || limit < 1) return null;

        let scores: Score[];
        scores = SDK.getAllScores();

        //sort all of them, DESC
        scores.sort(function (a, b) {
            return b.scorenum - a.scorenum;
        })

        let topTen: Score[];
        for (let i = 0; i < limit; i++) {
            topTen.push(scores[i]);
        }

        return topTen;
    }

    public static getAchievement(achievementID: number): Achievement {
        if (typeof achievementID !== 'number' || achievementID < 1) return null;
        this.pollAchievementFromDB(this.currentUserID, achievementID);
        return this.getAchievementFromCache(this.currentUserID, achievementID);
    }

    public static getAchievementProgress(achievementID: number) {
        if (typeof achievementID !== 'number' || achievementID < 1) return null;
        let achievement = this.getAchievement(achievementID);
        return { 'stepsComplete': achievement.stepsComplete, 'stepsTotal': achievement.stepsTotal };
    }

    public static getAchievementProgressString(achievementID: number): String {
        if (typeof achievementID !== 'number' || achievementID < 1) return null;
        let achievement = this.getAchievement(achievementID);
        return "Achievement progress: " + achievement.stepsComplete + " out of " + achievement.stepsTotal;
    }

    // The backends has NO WAY of setting stepsTotal for an achievement
    // How this would work is just implied I guess and I will not worry about it.
    // Since I don't even have any option to set it in the DB.
    public static updateAchievement(achievementID: number, stepsComplete: number) {
        if (typeof achievementID !== 'number' || achievementID < 1) return;
        let achievement = this.getAchievementFromCache(this.currentUserID, achievementID);
        achievement.stepsComplete = stepsComplete;
        this.postAchievementToDB(achievement);
    }

    public static isAchievementUnlocked(achievementID: number): boolean {
        if (typeof achievementID !== 'number' || achievementID < 1) return null;
        let progress = this.getAchievementProgress(achievementID);
        if (progress.stepsComplete >= progress.stepsTotal) return true;
        else return false;
    }



    //Private members below

    private static postScoreToDB(score: Score) {
        let url = this.serverURL + this.currentEndPoint + this.urlPostScore;
        let params = "userId=" + score.userID + "&score=" + score.scorenum;
        let request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                SDK.pollScoreFromDB(score.userID);
                // this is an additional call to the network which technically is not necessary
                // however we want to keep the information in the cache, thats exposed, accurate to the data from the server
                // and scores arent posted that often.
            }
            if (request.status !== 200) {
                SDK.log('Status @ postScoreToDB: Request failed.  Returned status of ' + request.status + " for user: " + score.userID + " score: " + score.scorenum);
            }
        };
    }

    private static pollScoreFromDB(userID: number) {
        let url = this.serverURL + this.currentEndPoint + this.urlGetScore;
        let params = "userId=" + userID;
        let request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                // Doc says: Returns: { score: int, timestamp: int }
                var jsonResponse = JSON.parse(request.responseText);
                let score: Score;
                score = SDK.getScoreFromCache(userID);
                score.scorenum = jsonResponse.score;
                score.timestamp = jsonResponse.timestamp
                // this writes the score to cache async
            }
            if (request.status !== 200) {
                SDK.log('Status @ pollScoreFromDB: Request failed.  Returned status of ' + request.status + " for user: " + userID);
            }
        };
    }

    private static postAchievementToDB(inAchievement: Achievement) {
        let url = this.serverURL + this.currentEndPoint + this.urlUpdateAchievement;//Params: userId: int, achievementId: int, stepsComplete: int
        let params = "userId=" + inAchievement.userID + "&achievementId=" + inAchievement.achievementID + "&stepsComplete=" + inAchievement.stepsComplete;
        let request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                SDK.pollAchievementFromDB(inAchievement.userID, inAchievement.achievementID);
                // same caching technique as scores
            }
            if (request.status !== 200) {
                SDK.log('Status @ postAchievementToDB: Request failed.  Returned status of ' + request.status + " for user: " + inAchievement.userID + " achievementID: " + inAchievement.achievementID);
            }
        };
    }

    private static pollAchievementFromDB(userID: number, achievementID: number) {
        let url = this.serverURL + this.currentEndPoint + this.urlGetAchievement; // Params:  userId:  int,  achievementId: int
        let params = "userId=" + userID + "&achievementId=" + achievementID;
        let request = this.ajaxGet(params, url);
        request.onload = function () {
            if (request.readyState == XMLHttpRequest.DONE) {
                // Doc says: Returns: { stepsComplete: int, stepsTotal: int }
                var jsonResponse = JSON.parse(request.responseText);
                let achievement: Achievement;
                achievement = SDK.getAchievementFromCache(userID, achievementID);
                achievement.stepsComplete = jsonResponse.stepsComplete;
                achievement.stepsTotal = jsonResponse.stepsTotal;
                // this writes the score to cache async
            }
            if (request.status !== 200) {
                SDK.log('Status @ pollAchievementFromDB: Request failed.  Returned status of ' + request.status + " for user: " + userID + " achievementID: " + achievementID);
            }
        };
    }

    private static ajaxGet(params, url): XMLHttpRequest{
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url + "?" + params, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(null);
        return xhr;
    }

    private static ajaxPost(params, url): XMLHttpRequest {
        let xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(params);
        return xhr;
    }

    private static getScoreFromCache(userID: number): Score {
        let outScore = null;
        for (let i = 0; i < this.scoreCache.length; i++) {
            if (this.scoreCache[i].userID === userID) {
                outScore = this.scoreCache[i];
            }
        }
        if (outScore == null) {
            outScore = this.pokeScoreEntry(userID);
        }
        return outScore;
    }

    private static pokeScoreEntry(userID: number): Score {
        // if a user has no score in the cache, we shall poke a zero one in there, 
        // so that we have a object/ index to write the actual score into later.This is its slot.
        let emptyScore: Score;
        emptyScore.userID = userID;
        emptyScore.timestamp = 0;
        emptyScore.scorenum = 0;
        return emptyScore;
    }

    private static pokeAchievementEntry(userID: number, achievementID: number): Achievement {
        // same as scores
        let achievementPoke: Achievement;
        achievementPoke.userID = userID;
        achievementPoke.achievementID = achievementID;
        achievementPoke.stepsComplete = 0;
        achievementPoke.stepsTotal = 0;
        return achievementPoke;
    }

    private static getAchievementFromCache(userID: number, achievementID: number): Achievement {
        let achievement = null;
        for (let i = 0; i < this.achievementCache.length; i++) {
            if (this.achievementCache[i].userID === userID && this.achievementCache[i].achievementID === achievementID) {
                achievement = this.achievementCache[i];
            }
        }
        if (achievement == null) {
            achievement = this.pokeAchievementEntry(userID, achievementID);
        }
        return achievement;
    }

    // adds user id to our array of all userids if it doesnt exist
    private static addUserId(userID: number) {
        for (let id in this.allUserIDs) {
            if (Number(id) === userID) {
                return;
            }
        }
        this.allUserIDs.push(userID);
    }

    private static log(data) {
        console.log(data);
    }

    // Seems like the server does the timestamping, since the Post Score Backend does not want a timestamp argument
    /*
    private static getUnixTime(): number {
        return Math.round((new Date()).getTime() / 1000);
    }
    */
    
}