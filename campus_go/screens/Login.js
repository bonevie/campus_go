import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Login({ navigation }) {
  const [emailOrId, setEmailOrId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // no auto-redirect

  const handleLogin = async () => {
    if (!emailOrId.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both Email/ID and Password.");
      return;
    }

    try {
      const storedUsers = await AsyncStorage.getItem("users");
      const users = storedUsers ? JSON.parse(storedUsers) : [];

      // ADMIN LOGIN
      if (emailOrId.trim().toLowerCase() === "admin@bisu.edu.ph" && password === "admin") {
        const adminUser = { email: "admin@bisu.edu.ph", isAdmin: true };
        await AsyncStorage.setItem("loggedUser", JSON.stringify(adminUser));
        navigation.replace("AdminDashboard");
        return;
      }

      // STUDENT / FACULTY LOGIN
      const foundUser = users.find(
        (u) =>
          (u.email.toLowerCase() === emailOrId.toLowerCase() || u.idNumber === emailOrId) &&
          u.password === password
      );

      if (!foundUser) {
        Alert.alert("Login Failed", "Invalid email/ID or password.");
        return;
      }

      await AsyncStorage.setItem("loggedUser", JSON.stringify({ ...foundUser, isAdmin: false }));
      navigation.replace("UserDashboard", { user: foundUser });
    } catch (error) {
      console.log("Login error:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  if (loading) return null; // optional spinner

  return (
    <LinearGradient colors={["#167CF2", "#2A9EFE"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Campus-Go</Text>
          <Text style={styles.subtitle}>Navigate Your Campus Journey</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Login</Text>

            <Text style={styles.label}>BISU Email or ID Number</Text>
            <TextInput
              placeholder="student@bisu.edu.ph or 2024-001"
              style={styles.input}
              autoCapitalize="none"
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
              Demo Credentials:{"\n"}Student: any registered account{"\n"}Admin: admin@bisu.edu.ph / admin
            </Text>

            <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
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
      </KeyboardAvoidingView>
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
