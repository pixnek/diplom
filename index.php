<?
/*function enter ()
 { 
$error = array(); //массив для ошибок 	
if ($_POST['login'] != "" && $_POST['password'] != "") //если поля заполнены 	

{ 		
	$login = $_POST['login']; 
	$password = $_POST['password'];

	$rez = mysql_query("SELECT * FROM users WHERE login=$login"); //запрашиваем строку из БД с логином, введённым пользователем 		
	if (mysql_num_rows($rez) == 1) //если нашлась одна строка, значит такой юзер существует в БД 		

	{ 			
		$row = mysql_fetch_assoc($rez); 			
		if (md5(md5($password).$row['salt']) == $row['password']) //сравниваем хэшированный пароль из БД с хэшированными паролем, введённым пользователем и солью (алгоритм хэширования описан в предыдущей статье) 						

		{ 
		//пишем логин и хэшированный пароль в cookie, также создаём переменную сессии
		setcookie ("login", $row['login'], time() + 50000); 						
		setcookie ("password", md5($row['login'].$row['password']), time() + 50000); 					
		$_SESSION['id'] = $row['id'];	//записываем в сессию id пользователя 				

		$id = $_SESSION['id']; 				
		lastAct($id); 				
		return $error; 			
	} 			
	else //если пароли не совпали 			

	{ 				
		$error[] = "Неверный пароль"; 										
		return $error; 			
	} 		
} 		
	else //если такого пользователя не найдено в БД 		

	{ 			
		$error[] = "Неверный логин и пароль"; 			
		return $error; 		
	} 	
} 	
 

	else 	
	{ 		
		$error[] = "Поля не должны быть пустыми!"; 				
		return $error; 	
	} 

}*/
session_start();
if(_SESSION['admin']!="admin"){
	header("Location:login.php");
	exit;
}
?>