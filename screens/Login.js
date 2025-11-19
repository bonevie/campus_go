import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LoginScreen({ navigation }) {
  const [emailOrId, setEmailOrId] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const storedUsers = await AsyncStorage.getItem("users");
    const users = storedUsers ? JSON.parse(storedUsers) : [];

    // 🔐 CHECK ADMIN LOGIN
    if (
      emailOrId.trim().toLowerCase() === "admin@bisu.edu.ph" &&
      password === "admin"
    ) {
      navigation.replace("AdminDashboard");
      return;
    }

    // 🔐 CHECK IF USER EXISTS
    const foundUser = users.find(
      (u) =>
        (u.email.toLowerCase() === emailOrId.toLowerCase() ||
          u.idNumber === emailOrId) &&
        u.password === password
    );

    if (!foundUser) {
      alert("Invalid email/ID or password.");
      return;
    }

    // SAVE LOGGED-IN USER SESSION
    await AsyncStorage.setItem("loggedUser", JSON.stringify(foundUser));

    navigation.replace("UserDashboard");
  };

  return (
    <LinearGradient colors={["#167CF2", "#2A9EFE"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <Text style={styles.title}>Campus-Go</Text>
        <Text style={styles.subtitle}>Navigate Your Campus Journey</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Login</Text>

          <Text style={styles.label}>BISU Email or ID Number</Text>
          <TextInput
            placeholder="student@bisu.edu.ph or 2024-001"
            style={styles.input}
            value={emailOrId}
            onChangeText={setEmailOrId}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            placeholder="Enter your password"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginText}>Login</Text>
          </TouchableOpacity>

          <Text style={styles.demoBox}>
            Demo Credentials:{"\n"}
            Student: any email{"\n"}
            Admin: admin@bisu.edu.ph / password: admin
          </Text>

          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.signupText}>
              Don’t have an account? <Text style={{ fontWeight: "bold" }}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.visitorBtn}
          onPress={() => navigation.navigate("VisitorMap")}
        >
          <Text style={styles.visitorText}>Continue as Visitor (Map Only)</Text>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { padding: 30 },
  title: {
    marginTop: 60,
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
  },
  subtitle: {
    color: "white",
    textAlign: "center",
    marginBottom: 30,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    elevation: 6,
  },
  cardTitle: { fontSize: 20, marginBottom: 15, fontWeight: "bold" },
  label: { marginTop: 10, fontWeight: "600" },
  input: {
    backgroundColor: "#eee",
    padding: 12,
    borderRadius: 10,
    marginTop: 5,
  },
  loginBtn: {
    backgroundColor: "black",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  loginText: { color: "white", textAlign: "center", fontWeight: "bold" },
  signupText: { textAlign: "center", marginTop: 15 },
  demoBox: {
    backgroundColor: "#EAF3FF",
    padding: 10,
    borderRadius: 8,
    marginTop: 15,
  },
  visitorBtn: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "white",
  },
  visitorText: { color: "white", textAlign: "center" },
});
