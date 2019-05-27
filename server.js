"use strict"
var cluster = require('cluster');
var cpuCount = require('os').cpus().length;

if (!cluster.isMaster){
}else{
	var upstreamServerAddresses = [];
	for(var i = 0; i<cpuCount;i+=1){
		var worker = cluster.fork();
		upstreamServerAddresses.push(':500'+(i+1));
	}
	var compressionBalancer = require('compression');
    var expressBalancer = require('express');
    var appBalancer = expressBalancer();
    appBalancer.use(compressionBalancer());
    var NumHost = 0;
    appBalancer.get("/", function (request, response) {
        NumHost++;
        if(NumHost===4) NumHost=0;
        response.redirect("http://" + request.headers.host.split(':')[0] + upstreamServerAddresses[NumHost]);
    });
    appBalancer.listen(3000);
    cluster.on('exit', function (worker, code, signal) {
        console.log('worker ' + worker.id + ' died');
    });
}
if(cluster.isWorker){
	console.log('Worker '+process.pid+' started');
	var worker_id = cluster.worker.id;
	var compression = require('compression');
	var express = require('express');
	var app = express();
    var cookieParser = require('cookie-parser');
    var events = require('events');
    var http = require('http').Server(app);
	var io = require('socket.io')(http);
	var uuid = require('uuid');
    var cookie = require('cookie');
    const MongoClient = require("mongodb").MongoClient;
    app.use(compression());
    app.use(cookieParser());
    app.use('/assets', express.static('assets'));
    var localDB = [];
	
	app.use(function (req, res, next) {
        var cookie = req.cookies.cookieName;
        if (cookie === undefined) {
            var idUser = uuid.v4();
            res.cookie('cookieName', idUser, {maxAge: 900000, httpOnly: true});
            console.log('Создана новая cookie ' + idUser);
        }
        else {
            console.log('У пользователя есть cookie', cookie);
        }
        next();
    });
	
	app.get("/", function (request, response) {
        response.sendFile(__dirname + '/index.html');
    });

    app.get("/monitor", function (request, response) {
        response.sendFile(__dirname + '/monitorGame.html');
    });
	
	app.set('port', (process.env.PORT || 5000 + worker_id));
	
	http.listen(app.get('port'), function () {
        console.log('listening on port', app.get('port'));
    });
	
	io.on('connection', function (socket) {
		socket.on('game', function (isNewGame, UserCode) {
			console.log(UserCode);
            console.log("game_cookie");
            console.log(socket.request.headers.cookie);
			if (socket.request.headers.cookie === undefined) {
                socket.emit('redirect', '/');
            } else {
				var cookie1 = cookie.parse(socket.request.headers.cookie);
				var eventEmitter = new events.EventEmitter();
				const mongoClient = new MongoClient("mongodb://localhost:27017/", {useNewUrlParser: true});
				eventEmitter.on('GameLoad', function () {
                    socket.join(socket.id);
                    var numGame = findGame(UserCode);
					if(localDB[numGame].numberStep == 1){ 
						localDB[numGame]=AI(localDB[numGame]);
					}
                    socket.emit('stateGame', localDB[numGame]);
                });
				mongoClient.connect(function (err, client) {
					const db = client.db("usersdb");
					if (err) return console.log(err);
					db.collection("games").findOne({idUser: UserCode}, function (err, doc) {
						var idGame = uuid.v4();
						if (doc !== null) {
							var numGame = findGame(UserCode);
							if (numGame !== undefined) {
								if (isNewGame === 1) {
									var table = [];
									table[0]=[];
									for(var i=0;i<17;i++){
										table[0][i]=0;
									}
									localDB[numGame].numberStep = 1;
									localDB[numGame].comment = "Ход компьютера";
									localDB[numGame].istory = [];
								}else{
									localDB[numGame].idGame = doc.idGame;
									localDB[numGame].numberStep = doc.numberStep;
									localDB[numGame].comment = doc.comment;
									localDB[numGame].istory=doc.istory;
								}
							}else{
								if(isNewGame === 1){
									var table = [];
									table[0]=[];
									for(var i=0;i<17;i++){
										table[0][i]=0;
									}
									localDB.push({
										idGame: doc.idGame,
										idUser: doc.idUser,
										numberStep: 1,
										comment: "Ход компьютера",
										istory: []
									});
								}else{
									localDB.push({
										idGame: doc.idGame,
										idUser: doc.idUser,
										numberStep: doc.numberStep,
										comment: doc.comment,
										istory: doc.istory
									});
								}
							}
							console.log("Игра найдена, состояние загружено");
							eventEmitter.emit('GameLoad');
						}else{
							var table = [];
							table[0]=[];
							for(var i=0;i<17;i++){
								table[0][i]=0;
							}
							db.collection("games").insertOne({
								idGame: idGame,
								idUser: UserCode,
								numberStep: 1,
								comment: "Ход компьютера",
								istory: []
							},function(err,results){
								if(err)return console.log(err);
								client.close();
								var numGame = findGame(UserCode);
								if(numGame!==undefined){
									localDB[numGame].idGame = idGame;
									localDB[numGame].numberStep = 1;
									localDB[numGame].comment = "Ход противника";
									localDD[numGame].istory = [];
									console.log("Игра найдена, перезаписана");
								}else{
									localDB.push({
										idGame: idGame,
										idUser: UserCode,
										numberStep: 1,
										comment: "Ход компьютера",
										istory: []
									});
									console.log("Игра не найдена, создана новая");
								}
								eventEmitter.emit('GameLoad');
							});
						}
						if (err) return console.log(err);
						client.close();
					});
				});
			}
		});
		
		socket.on('disconnect',function (state){
			console.log("disconnect_cookie");
			console.log(socket.request.headers.cookie);
            if (socket.request.headers.cookie !== undefined) {
                var cookie1 = cookie.parse(socket.request.headers.cookie);
                var b = cookie1['cookieName'];
                var numGame = findGame(b);
                if (numGame !== undefined) {
                    UpdateGameState(b, localDB[numGame]);
                    //localDB.splice(numGame);
                }
            }
        });
		
		socket.on('serverInfo', function () {
            var used = process.memoryUsage().heapUsed / 1024 / 1024;
            socket.emit('answerServerInfo', Math.round(used * 100) / 100, io.engine.clientsCount);
        });
		
		socket.on('getLocalDB', function () {
            socket.emit('answerLocalDB', localDB);
        });
		
		socket.on('move', function (direction, UserCode) {
			var cookie1 = cookie.parse(socket.request.headers.cookie);
			var b = cookie['cookieName'];
			var numGame = findGame(UserCode);
			if(localDB[numGame]!==undefined){
				localDB[numGame].comment = "Вы убрали ";
				switch(direction){
					case '1':
						localDB[numGame].istory[localDB[numGame].numberStep-1] = 1;
						localDB[numGame].comment+=" одну палочку";
						break;
					case '2':
						localDB[numGame].istory[localDB[numGame].numberStep-1] = 2;
						localDB[numGame].comment+=" две палочки";
						break;
					case '3':
						localDB[numGame].istory[localDB[numGame].numberStep-1] = 3;
						localDB[numGame].comment+=" три палочки";
						break;
					default:
				}
				localDB[numGame].numberStep++;
				localDB[numGame]=AI(localDB[numGame]);
				if(isFinish(localDB[numGame])){
					socket.emit('finalGame',localDB[numGame]);
				}else{
					socket.emit('stateGame',localDB[numGame]);
				}
			}
		});
	});
}

function AI(game){
	if(isFinish(game)){
		return game;
	}else{
		game.comment = "Компьютер убрал ";
		var istory = game.istory;
		var count = game.numberStep;
		var sum = 0;
		for(var i=0;i<count-1;i++){
			sum+=istory[i];
		}
		if(17-sum <= 4){
			switch(17-sum){
				
				case 2:
					game.istory[count-1]=1;
					game.comment +=" одну палочку";
					break;
				case 3:
					game.istory[count-1]=2;
					game.comment +=" две палочки";
					break;
				case 4:
					game.istory[count-1]=3;
					game.comment +=" три палочки";
					break;
				default:
			}
		}else{
			var raund = Math.floor(Math.random()*3)+1;
			switch(raund){
				case 1:
					game.istory[count-1]=1;
					game.comment +=" одну палочку";
					break;
				case 2:
					game.istory[count-1]=2;
					game.comment +=" две палочки";
					break;
				case 3:
					game.istory[count-1]=3;
					game.comment +=" три палочки";
					break;
				default:
			}
		}
		game.numberStep++;
		return game;
	}
}

function isFinish (game){
	var istory = game.istory;
	var count = game.numberStep;
	var sum = 0;
	for(var i=0;i<count-1;i++){
		sum+=istory[i];
	}
	if(sum>15) return true;
	else return false;
}

function UpdateGameState(idUser,game) {
    const mongoClient = new MongoClient("mongodb://localhost:27017/", { useNewUrlParser: true });
    if(game!==undefined) {
        mongoClient.connect(function (err, client) {
            if (err) return console.log(err);
            const db = client.db("usersdb");
            db.collection("games").findOneAndUpdate(
                {idUser: idUser},              // критерий выборки
                {
                    $set: {
                        numberStep: game.numberStep,
						comment: game.comment,
						istory: game.istory
                    }
                },     // параметр обновления
                {                           // доп. опции обновления
                    returnOriginal: false
                },
                function (err, result) {
                    //console.log(result);
                    client.close();
                }
            );
        });
    }else{
        console.log("Ошибка в обновлении БД, нет обекта game")
    }
}

function findGame(idUser) {
    var len = localDB.length;
    for(var i=0;i<len;i++){
        if(localDB[i].idUser.localeCompare(idUser)===0) {
            return i;
        }
    }
}