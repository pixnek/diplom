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
    appBalancer.listen(5000);
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
	var bodyParser = require('body-parser');
	var urlencodedParser = bodyParser.urlencoded({ extended: false });
	const path = require('path');
	const fs = require("fs");
    const MongoClient = require("mongodb").MongoClient;
	const mongoClient = new MongoClient("mongodb://localhost:27017/", {useNewUrlParser: true});
    
	app.use(compression());
    app.use(cookieParser());
	app.use(urlencodedParser);	
	
    app.use('/assets', express.static('assets'));
	app.use('/libs',express.static(path.join(__dirname, 'libs')));
	app.use('/resource',express.static(path.join(__dirname, 'resource')));
	
	app.set('port', (process.env.PORT || 5000 + worker_id));
	
	function IsCookie(cook){
		if(cook.indexOf(':')!=-1)return false;
		if(cook.indexOf(';')!=-1)return false;
		if(cook.indexOf(' ')!=-1)return false;
		if(cook.indexOf('{')!=-1)return false;
		if(cook.indexOf('}')!=-1)return false;
		if(cook.indexOf('"')!=-1)return false;
		if(cook.indexOf("'")!=-1)return false;
		if(cook.indexOf(',')!=-1)return false;
		if(cook.indexOf('<')!=-1)return false;
		if(cook.indexOf('?')!=-1)return false;
		if(cook.indexOf('>')!=-1)return false;
		if(cook.indexOf('#')!=-1)return false;
		if(cook.indexOf('$')!=-1)return false;
		if(cook.indexOf('^')!=-1)return false;
		if(cook.indexOf('%')!=-1)return false;
		if(cook.indexOf('&')!=-1)return false;
		if(cook.indexOf('*')!=-1)return false;
		if(cook.indexOf('(')!=-1)return false;
		if(cook.indexOf(')')!=-1)return false;
		return true;
	}
	
	app.post('/auth',urlencodedParser,function(req,res){
		console.log("EnterAuth");
			mongoClient.connect(function (err, client) {
				console.log("EnterDB");
				if(err){
					console.log("ErrorLogin");
					return null;
				}
				const db = client.db("usersdb");
				var tlogin = req.body.login;
				var tpass = req.body.pass;
				console.log(tlogin+"\n"+tpass);
				if((!IsCookie(tpass))||(!IsCookie(tlogin))){
					var tip =(req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
					var content = new Date()+"\t" +tip+"\t"+tlogin+"\t"+tpass+"\tпопытка инъекции при авторизации\n";
					fs.appendFile('log.wgl', content, (err) => {
						if (err) {
							console.log("При добавления лога возникла ошибка");
							return
						}
					});
					return;
				}
				db.collection("users").findOne({login:tlogin, pass:tpass},function(err,doc){
					console.log("Connect");
					if(doc===null){
						console.log("fINDError");
						var tip =(req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
					var content = new Date()+"\t" +tip+"\t"+tlogin+"\t"+tpass+"\tнекоректная пара логин/пароль\n";
						fs.appendFile('log.wgl', content, (err) => {
							if (err) {
								console.log("При добавления лога возникла ошибка");
								return
							}
						});
					}else{
						var idUser=uuid.v4();
						var ip = (req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
						console.log(ip);
						const crypt = require('crypto');
						const hash = crypt.createHash('sha256');
						hash.update(idUser);
						idUser = hash.digest('hex');
						const hash2 = crypt.createHash('sha256');
						var result = idUser+ip;
						console.log(result);
						hash2.update(result);
						var tmp = hash2.digest('hex');
						console.log(tmp);
						db.collection("cookies").findOne({login : tlogin},function(err, doc1){
							if(err){
								console.log("Ошибка при поиске похожей сессии");
								return;
							}
							if(doc1===null){
								db.collection("cookies").insertOne({
									 createdAt:new Date(),
									 login:tlogin,
									 idUser:idUser,
									 value:tmp
								 },{expireAfterSeconds: 300 } );
							}else{
								db.collection("cookies").updateOne({login:tlogin},{$set:{
																					 createdAt:new Date(),
																					 idUser:idUser,
																					 value:tmp
								}});
							}
							res.cookie('cookieName',idUser,{maxAge:900000, httpOnly: true});
					}
					res.redirect("/");
				});
			});
	});	
	
	app.get('/',function (request, response, next) {
        var cookie = request.cookies.cookieName;
		console.log(request.port);
        if (cookie === undefined) {
			console.log("нет куки");
			response.sendFile(__dirname + '/index.html');
        }else{
			if(!IsCookie(cookie)){
				var tip =(req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress||null;
				var content = new Date()+"\t" +tip+"\t"+tlogin+"\t"+tpass+"\tпопытка инъекции через куки\n";
				fs.appendFile('log.wgl', content, (err) => {
					if (err) {
						console.log("При добавления лога возникла ошибка");
						return
					}
				});
				return;
			}
			mongoClient.connect(function (err, client) {
				if(err){
					return false;
				}
				const db = client.db("usersdb");
				console.log("соединение установлено");
				db.collection("cookies").findOne({idUser:cookie},function(err,doc){
					if(doc===null){
						console.log("не найдена сессия");
						return false;
					}else{
						console.log("найдена сессия");
						var ip = (request.headers['x-forwarded-for'] || '').split(',').pop() || request.connection.remoteAddress || request.socket.remoteAddress || request.connection.socket.remoteAddress;
						const crypt = require('crypto');
						console.log(ip);
						const hash = crypt.createHash('sha256');
						var result = cookie+ip;
						const hash1 = crypt.createHash('sha256');
						hash1.update(result);
						var tmp = hash1.digest('hex');
						var t = doc['value'].indexOf(tmp);
						if(t==0){
							console.log("cookie совпадают");
							response.sendFile(__dirname + '/main.html');
						}else{
							console.log("cookie не совпадают");
							var content = new Date()+"\t" +ip+"\t"+tlogin+"\t"+tpass+"\tПОПЫТКА АУТЕНТИФИЦИРОВАТЬСЯ С ДРУГОГО АЙПИ\n";
							fs.appendFile('log.wgl', content, (err) => {
								if (err) {
									console.log("При добавления лога возникла ошибка");
									return
								}
							});
							response.sendFile(__dirname + '/index.html');
							return false;
						 }
					}
				});
			});
		}
    });
	app.get('/registration', function (request, response) {
		var cookie = request.cookies.cookieName;
		if(cookie!==undefined){
			response.clearCookie('cookieName');
			response.redirect('/');
		}
        response.sendFile(__dirname + '/registration.html');
    });
	app.get('/logout',(req,res) => {
		req.session.destroy((err) => {
			if(err) {
				return console.log(err);
			}
			res.redirect('/');
		});

	});
	
	http.listen(app.get('port'), function () {
        console.log('listening on port', app.get('port'));
    });
	
	io.on('connection', function (socket) {
		socket.on("update",function(){
			var req = socket.request;
			var a = req.headers.cookie;
			var b = cookie.parse(a);
			var bcookie = b.cookieName;
			if(!IsCookie(bcookie)){
				console.log("попытка инъекции");
				return false;
			}
			console.log(b);	
			mongoClient.connect(function (err, client) {
				if(err){
					return false;
				}
				const db = client.db("usersdb");
				console.log("соединение установлено");
				db.collection("cookies").findOne({idUser:bcookie},function(err,doc){
					if(doc===null){
						var ip = (request.headers['x-forwarded-for'] || '').split(',').pop() || request.connection.remoteAddress || request.socket.remoteAddress || request.connection.socket.remoteAddress;
						var content = new Date()+"\t" +ip+"\t"+tlogin+"\t"+tpass+"\tпопытка обновить старый куки или срок сессии истек\n";
						fs.appendFile('log.wgl', content, (err) => {
							if (err) {
								console.log("При добавления лога возникла ошибка");
								return
							}
						});
						console.log("не найдена сессия");
						return false;
					}else{
						console.log("найдена сессия");
						var ip = (request.headers['x-forwarded-for'] || '').split(',').pop() || request.connection.remoteAddress || request.socket.remoteAddress || request.connection.socket.remoteAddress;
						const crypt = require('crypto');
						console.log(ip);
						const hash = crypt.createHash('sha256');
						var result = cookie+ip;
						const hash1 = crypt.createHash('sha256');
						hash1.update(result);
						var tmp = hash1.digest('hex');
						var t = doc['value'].indexOf(tmp);
						if(t==0){
							db.collection("cookies").updateOne({idUser:cookie},{$set:{createdAt:new Date()}});
						}else{
							var content = new Date()+"\t" +ip+"\t"+tlogin+"\t"+tpass+"\tпопытка обновить старый куки\n";
							fs.appendFile('log.wgl', content, (err) => {
								if (err) {
									console.log("При добавления лога возникла ошибка");
									return
								}
							});
							response.clearCookie('cookieName');
							response.redirect('/');
						}
						return true;
					}
				});
			});
		});
		socket.on("first",function(){
			var a = socket.request.headers.cookie;
			var b = cookie.parse(a);
			var bcookie = b.cookieName;
			mongoClient.connect(function(err,client){
				if(err){
					console.log("Ошибка соединения при сохранении");
					socket.emit("ErrorSave");
					return;
				}
				const db = client.db("usersdb");
				db.collection("cookies").findOne({idUser:bcookie},function(err,doc){
					if(err){
						console.log("Ошибка при поиске пользователя");
						return false;
					}
					if(doc === null){
						console.log("Пользователь не найден");
						return false;
					}
					db.collection("home").findOne({name : doc.login},function(err,doc1){
						if(err){
							console.log("Ошибка при поиске существующего проекта у польщователя");
							return false;
						}
						if(doc1 === null){
							console.log("у пользователя нет проекта");
							var tmp = {};
							socket.emit("getProject",tmp);
						}else{
							console.log("Пользователь имеет проект");
							console.log(doc1.rooms);
							socket.emit("getProject",doc1.rooms);
						}
					});
				});
			});
		});
		socket.on("clear",function(){
			var a = socket.request.headers.cookie;
			var b = cookie.parse(a);
			var bcookie = b.cookieName;
			mongoClient.connect(function(err,client){
				if(err){
					console.log("Ошибка соединения при удалении");
					socket.emit("ErrorSave");
					return;
				}
				const db = client.db("usersdb");
				db.collection("cookies").findOne({idUser:bcookie},function(err,doc){
					if(err){
						console.log("Ошибка при поиске пользователя");
						return false;
					}
					if(doc === null){
						console.log("Пользователь не найден");
						return false;
					}
					db.collection("home").findOne({name : doc.login},function(err,doc1){
						if(err){
							console.log("Ошибка при поиске существующего проекта у пользователя");
							return false;
						}
						if(doc1 === null){
							console.log("у пользователя нет проекта");
						}else{
							console.log("Проект удален");
							db.collection("home").deleteMany({name : doc.login},function(err,doc){
								if(err){
									socket.emit("ErrorSave");
								}
							});
						}
					});
				});
			});
		});
		socket.on("init",function(){
			mongoClient.connect(function (err, client) {
				if(err){
					console.log("ConnectionError");
					socket.emit("ConnectionError");
					return null;
				}
				console.log("NotError");
				const db = client.db("usersdb");
				db.dropCollection('mebel',function(err,doc){
					console.log("коллекция очищена")
				});
				var myObj = [
					{name:"stul1",pathImg:"resource/stul1.png",pathObj:"resource/Stul.obj",pathTex:"resource/Stul.jpg"},
					{name:"krovat1",pathImg:"resource/krovat1.png",pathObj:"resource/Krovat.obj",pathTex:"resource/Krovat.jpg"}
				];
				db.collection("mebel").insertMany(myObj,function(err1,doc){
					if(err){
						console.log("Ошибка инициализации");
						return;
					}
				});
			});
		});
		socket.on("save",function(Rooms){
			var a = socket.request.headers.cookie;
			var b = cookie.parse(a);
			var bcookie = b.cookieName;
			mongoClient.connect(function(err,client){
				if(err){
					console.log("Ошибка соединения при сохранении");
					socket.emit("ErrorSave");
					return;
				}
				const db = client.db("usersdb");
				db.collection("cookies").findOne({idUser:bcookie},function(err,doc){
					if(err){
						console.log("Ошибка при поиске пользователя");
						return false;
					}
					if(doc === null){
						console.log("Пользователь не найден");
						return false;
					}
					db.collection("home").findOne({name : doc.login},function(err,doc1){
						if(err){
							console.log("Ошибка при поиске существующего проекта у польщователя");
							return false;
						}
						if(doc1 === null){
							db.collection("home").insertOne({name : doc.login, rooms : Rooms},function(err,doc){
								if(err){
									console.log("Ошибка при создании проекта у пользователя");
									return false;
								}
								console.log("Проект сохранен");
							});
						}else{
							console.log("Проект обновлен");
							db.collection("home").updateMany({name : doc.login},{$set:{rooms : Rooms}});
						}
					});
				});
			});
		});
		socket.on("spis",function(){
			mongoClient.connect(function (err, client) {
				console.log("Connect");
				if(err){
					console.log("ConnectionError");
					socket.emit("ConnectionError");
					return null;
				}
				console.log("NotError");
				const db = client.db("usersdb");
				db.collection("mebel").find().toArray(function(err, results){
					if(err) return;
					var spisok = results;
					socket.emit("spis",spisok);
				});
			});
		});
		socket.on("registration",function(tlogin,tpass){
			if((!IsCookie(tlogin))||(!IsCookie(tpass))){
				var req = socket.request;
				var tip =(req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress||null;
				var content = new Date()+"\t" +tip+"\t"+tlogin+"\t"+tpass+"\tпопытка инъекции при регистрации\n";
				fs.appendFile('log.wgl', content, (err) => {
					if (err) {
						console.log("При добавления лога возникла ошибка");
						return
					}
				});
				return;
			}
			mongoClient.connect(function (err, client) {
				console.log("Connect");
				if(err){
					console.log("ConnectionError");
					socket.emit("ConnectionError");
					return null;
				}
				console.log("NotError");
				const db = client.db("usersdb");
				db.collection("users").findOne({login : tlogin},function(err1,doc){
					console.log("FindOne");
					if(err1){
						console.log("RegistrError");
						socket.emit("RegistrError");
						return null;
					}
					console.log("NotError");
					if(doc!==null){
						console.log("RegistrError");
						var req = socket.request;
						var tip =(req.headers['x-forwarded-for'] || '').split(',').pop() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress||null;
						var content = new Date()+"\t" +tip+"\t"+tlogin+"\t"+tpass+"\tпопытка зарегистрировать существующий e-mail\n";
						fs.appendFile('log.wgl', content, (err) => {
							if (err) {
								console.log("При добавления лога возникла ошибка");
								return
							}
						});
						socket.emit("RegistrError");
					}else{
						console.log("NotErrorFind");
						db.collection("users").insertOne({
							login : tlogin,
							pass : tpass
						});
						db.collection("users").findOne({login : tlogin},function(err2,doc){
							console.log("ConnectFindOneTwo");
							if(err2){
								console.log("RegistrInsertError");
								socket.emit("RegistrError");
								return null;
							}
							console.log("NotError");
							if(doc===null){
								console.log("RegistrInsertError");
								socket.emit("RegistrError");
							}else{
								console.log("RegistrTry");
								socket.emit("RegistrTry");
							}
						});
					}
				});
			});
		});
		
		socket.on('disconnect',function (state){
			console.log("disconnect_cookie");
			console.log(socket.request.headers.cookie);
        });
	});
}