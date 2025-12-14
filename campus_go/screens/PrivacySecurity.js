// PrivacySecurity.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PrivacySecurity({ navigation }) {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [loggedUser, setLoggedUser] = useState(null);

  const [permissions, setPermissions] = useState({
    notifications: true,
    location: false,
    sync: true,
  });
  const [reminderLead, setReminderLead] = useState(10);

  // 🔵 Load logged user
  useEffect(() => {
    const loadUser = async () => {
      const user = await AsyncStorage.getItem("loggedUser");
      if (user) setLoggedUser(JSON.parse(user));
    };
    loadUser();
  }, []);

  // 🔵 Load permissions safely (fixes String → Boolean crash)
  useEffect(() => {
    const loadPermissions = async () => {
      const saved = await AsyncStorage.getItem("permissions");
      if (saved) {
        const parsed = JSON.parse(saved);

        const fixed = {
          notifications:
            parsed.notifications === true ||
            parsed.notifications === "true",
          location:
            parsed.location === true ||
            parsed.location === "true",
          sync:
            parsed.sync === true ||
            parsed.sync === "true",
        };

        setPermissions(fixed);
        // load reminder lead time (per-user or global)
        try {
          const logged = await AsyncStorage.getItem('loggedUser');
          const lu = logged ? JSON.parse(logged) : null;
          const per = lu && lu.idNumber ? await AsyncStorage.getItem(`reminderLead_${lu.idNumber}`) : null;
          const glob = await AsyncStorage.getItem('reminderLeadMins');
          const val = per ? Number(per) : glob ? Number(glob) : 10;
          setReminderLead(Number(val || 10));
        } catch (e) {}
      }
    };
    loadPermissions();
  }, []);

  // Save permissions anytime a switch changes
  const updatePermission = async (key, value) => {
    const updated = { ...permissions, [key]: value };
    setPermissions(updated);
    await AsyncStorage.setItem("permissions", JSON.stringify(updated));

    // If notifications permission toggled, register/unregister push token
    if (key === 'notifications') {
      try {
        if (value) await registerForPush();
        else await unregisterForPush();
      } catch (e) {}
    }
  };

  const updateReminderLead = async (mins) => {
    try {
      setReminderLead(mins);
      const logged = await AsyncStorage.getItem('loggedUser');
      const lu = logged ? JSON.parse(logged) : null;
      if (lu && lu.idNumber) await AsyncStorage.setItem(`reminderLead_${lu.idNumber}`, String(mins));
      // also save global default for fallback
      await AsyncStorage.setItem('reminderLeadMins', String(mins));
    } catch (e) {}
  };

  // Register for Expo push token and save to shared pushTokens list
  const registerForPush = async () => {
    try {
      const Notifications = require('expo-notifications');
      const { status: existingStatus } = await Notifications.getPermissionsAsync?.();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync?.();
        finalStatus = status;
      }
      if (finalStatus === 'granted') {
        const tokenObj = await Notifications.getExpoPushTokenAsync?.();
        const token = tokenObj && tokenObj.data ? tokenObj.data : tokenObj;
        if (token) {
          try {
            await AsyncStorage.setItem('pushToken', token);
            const stored = await AsyncStorage.getItem('pushTokens');
            const list = stored ? JSON.parse(stored) : [];
            if (!list.includes(token)) {
              list.push(token);
              await AsyncStorage.setItem('pushTokens', JSON.stringify(list));
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // ignore
    }
  };

  // Unregister push: remove saved token from pushTokens and clear pushToken
  const unregisterForPush = async () => {
    try {
      const token = await AsyncStorage.getItem('pushToken');
      if (token) {
        const stored = await AsyncStorage.getItem('pushTokens');
        const list = stored ? JSON.parse(stored) : [];
        const filtered = list.filter((t) => t !== token);
        await AsyncStorage.setItem('pushTokens', JSON.stringify(filtered));
        await AsyncStorage.removeItem('pushToken');
      }
    } catch (e) {
      // ignore
    }
  };

  // Test reminder removed: scheduling helper removed to simplify UI.

  // 🔵 Change password
  const changePassword = async () => {
    if (!currentPass || !newPass || !confirmPass) {
      Alert.alert("Missing Fields", "Please fill all fields.");
      return;
    }

    if (newPass !== confirmPass) {
      Alert.alert("Error", "New password does not match.");
      return;
    }

    if (currentPass !== loggedUser.password) {
      Alert.alert("Error", "Current password is incorrect.");
      return;
    }

    const storedUsers = await AsyncStorage.getItem("users");
    let users = storedUsers ? JSON.parse(storedUsers) : [];

    users = users.map((u) =>
      u.email === loggedUser.email ? { ...u, password: newPass } : u
    );

    await AsyncStorage.setItem("users", JSON.stringify(users));

    const updated = { ...loggedUser, password: newPass };
    await AsyncStorage.setItem("loggedUser", JSON.stringify(updated));
    setLoggedUser(updated);

    Alert.alert("Success", "Your password has been updated.");

    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
  };

  // 🔴 Delete account
  const deleteAccount = () => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const storedUsers = await AsyncStorage.getItem("users");
            let users = storedUsers ? JSON.parse(storedUsers) : [];

            users = users.filter((u) => u.email !== loggedUser.email);

            await AsyncStorage.setItem("users", JSON.stringify(users));
            await AsyncStorage.removeItem("loggedUser");

            Alert.alert("Deleted", "Your account has been deleted.");
            navigation.replace("Login");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <LinearGradient colors={["#167CF2", "#2A9EFE"]} style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <Text style={styles.headerSub}>Manage your privacy preferences</Text>
      </LinearGradient>

      {/* Content */}
      <ScrollView style={styles.container}>
        {/* Change Password */}
        <Text style={styles.sectionTitle}>Change Password</Text>

        <TextInput
          style={styles.input}
          placeholder="Current Password"
          secureTextEntry
          value={currentPass}
          onChangeText={setCurrentPass}
        />

        <TextInput
          style={styles.input}
          placeholder="New Password"
          secureTextEntry
          value={newPass}
          onChangeText={setNewPass}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm New Password"
          secureTextEntry
          value={confirmPass}
          onChangeText={setConfirmPass}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={changePassword}>
          <Text style={styles.saveBtnText}>Update Password</Text>
        </TouchableOpacity>

        {/* Permissions */}
        <Text style={styles.sectionTitle}>App Permissions</Text>

        {Object.keys(permissions).map((key) => (
          <View key={key} style={styles.permissionRow}>
            <Text style={styles.permissionLabel}>
              {key === "notifications"
                ? "Notifications"
                : key === "location"
                ? "Location Access"
                : "Data Sync"}
            </Text>

            <Switch
              value={permissions[key]}
              onValueChange={(v) => updatePermission(key, v)}
            />
          </View>
        ))}
        {/* Reminder lead time */}
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Reminder Lead Time</Text>
          <Text style={{ color: '#666', marginBottom: 8 }}>Notify me this many minutes before a scheduled class.</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {[5, 10, 15, 30].map((m) => (
              <TouchableOpacity key={m} onPress={() => updateReminderLead(m)} style={{ padding: 10, backgroundColor: reminderLead === m ? '#167CF2' : 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5' }}>
                <Text style={{ color: reminderLead === m ? 'white' : '#333', fontWeight: '700' }}>{m}m</Text>
              </TouchableOpacity>
            ))}

            {/* Test Reminder removed */}
          </View>
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>

        <View style={styles.dangerWrapper}>
          <View style={styles.dangerHeader}>
            <Ionicons name="warning" size={28} color="#FF3B30" />
            <Text style={styles.dangerTitle}>Delete Account</Text>
          </View>

          <Text style={styles.dangerMessage}>
            Deleting your account will permanently erase your data. This action
            cannot be undone.
          </Text>

          <TouchableOpacity style={styles.deleteButton} onPress={deleteAccount}>
            <Ionicons name="trash-outline" size={20} color="white" />
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  header: {
    paddingTop: 70,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  backBtn: {
    position: "absolute",
    top: 35,
    left: 20,
    padding: 5,
  },
  headerTitle: {
    fontSize: 26,
    color: "white",
    fontWeight: "bold",
  },
  headerSub: {
    fontSize: 14,
    color: "#e6eaff",
    marginTop: 4,
  },

  container: {
    flex: 1,
    backgroundColor: "#F5F6FC",
    padding: 20,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
  },

  input: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },

  saveBtn: {
    backgroundColor: "#4A60FF",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  saveBtnText: {
    color: "white",
    fontWeight: "700",
  },

  permissionRow: {
    backgroundColor: "white",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  permissionLabel: {
    fontSize: 15,
    color: "#333",
  },

  dangerWrapper: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: "#FFE5E5",
  },
  dangerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  dangerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#B00000",
    marginLeft: 10,
  },
  dangerMessage: {
    color: "#555",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});
