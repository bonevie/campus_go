import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SignUp({ navigation }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [role, setRole] = useState("Student");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const handleSignup = async () => {
    // empty fields
    if (!fullName || !email || !idNumber || !password || !confirmPass) {
      alert("Please complete all fields.");
      return;
    }

    // bisu email validation
    if (!email.toLowerCase().endsWith("@bisu.edu.ph")) {
      alert("Please use a valid BISU email (@bisu.edu.ph)");
      return;
    }

    // confirm pass
    if (password !== confirmPass) {
      alert("Passwords do not match!");
      return;
    }

    // password strength
    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    const storedUsers = await AsyncStorage.getItem("users");
    const users = storedUsers ? JSON.parse(storedUsers) : [];

    // check duplicate
    const exists = users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() ||
        u.idNumber === idNumber
    );

    if (exists) {
      alert("Email or ID number already registered.");
      return;
    }

    const newUser = {
      fullName,
      email: email.toLowerCase(),
      idNumber,
      role,
      password,
    };

    users.push(newUser);
    await AsyncStorage.setItem("users", JSON.stringify(users));

    alert("Account created successfully!");
    navigation.replace("Login");
  };

  return (
    <LinearGradient colors={["#167CF2", "#2A9EFE"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back to Login</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              placeholder="Juan Dela Cruz"
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.label}>BISU Email</Text>
            <TextInput
              placeholder="student@bisu.edu.ph"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />

            <Text style={styles.label}>ID Number</Text>
            <TextInput
              placeholder="2024-001"
              style={styles.input}
              value={idNumber}
              onChangeText={setIdNumber}
            />

            <Text style={styles.label}>Role</Text>
            <View style={styles.pickerBox}>
              <Picker selectedValue={role} onValueChange={setRole}>
                <Picker.Item label="Student" value="Student" />
                <Picker.Item label="Faculty" value="Faculty" />
              </Picker>
            </View>

            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="Enter password"
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              placeholder="Confirm password"
              secureTextEntry
              style={styles.input}
              value={confirmPass}
              onChangeText={setConfirmPass}
            />

            <TouchableOpacity style={styles.signupBtn} onPress={handleSignup}>
              <Text style={styles.signupText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 25,
  },
  backText: {
    color: "white",
    marginTop: 45,
    marginBottom: 10,
    fontSize: 16,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    elevation: 6,
  },
  cardTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  label: { marginTop: 10, fontWeight: "600" },
  input: {
    backgroundColor: "#eee",
    padding: 12,
    borderRadius: 10,
    marginTop: 5,
  },
  pickerBox: {
    backgroundColor: "#eee",
    borderRadius: 10,
    marginTop: 5,
  },
  signupBtn: {
    backgroundColor: "black",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  signupText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
  },
});
