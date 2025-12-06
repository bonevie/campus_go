// AdminDashboard.js
import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Image,
  Alert,
  DeviceEventEmitter, // <-- added
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BuildingsContext } from "./BuildingsContext";
import * as ImagePicker from "expo-image-picker";

export default function AdminDashboard() {
  const navigation = useNavigation();
  const { buildings, setBuildings } = useContext(BuildingsContext);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newRooms, setNewRooms] = useState("");
  const [newSteps, setNewSteps] = useState("");
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [floorPlan, setFloorPlan] = useState(null);

  // SAFELY PARSE NUMBER
  const safeNum = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  // LOAD SAVED BUILDINGS
  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const stored = await AsyncStorage.getItem("campusBuildings");
        if (stored) {
          const parsed = JSON.parse(stored).map((b) => ({
            ...b,
            x: safeNum(b.x),
            y: safeNum(b.y),
            stepsFromMainGate: safeNum(b.stepsFromMainGate),
            rooms: Array.isArray(b.rooms) ? b.rooms : [],
            floorPlan: b.floorPlan || null,
          }));
          setBuildings(parsed);
        }
      } catch (e) {
        console.log("LOAD ERROR:", e);
      }
    };
    loadBuildings();
  }, []);

  // SAVE STORAGE (now emits routes-updated after successful save)
  const saveToStorage = async (data) => {
    try {
      await AsyncStorage.setItem("campusBuildings", JSON.stringify(data));
      // notify visitor map and any listeners
      DeviceEventEmitter.emit("routes-updated");
    } catch (e) {
      console.log("SAVE ERROR:", e);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setNewName("");
    setNewDept("");
    setNewRooms("");
    setNewSteps("");
    setNewX("");
    setNewY("");
    setFloorPlan(null);
    setModalVisible(true);
  };

  const openEditModal = (b) => {
    setEditingId(b.id);
    setNewName(b.name);
    setNewDept(b.department);
    setNewRooms(b.rooms.join(", "));
    setNewSteps(String(b.stepsFromMainGate));
    setNewX(String(b.x));
    setNewY(String(b.y));
    setFloorPlan(b.floorPlan || null);
    setModalVisible(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      alert("Permission is required to access photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      setFloorPlan(result.assets[0].uri);
    }
  };

  const saveBuilding = () => {
    if (!newName.trim()) return;

    const buildingObj = {
      id: editingId ?? (buildings.length ? Math.max(...buildings.map(b=>Number(b.id))) + 1 : 1),
      name: newName.trim(),
      department: newDept.trim(),
      rooms: newRooms ? newRooms.split(",").map((r) => r.trim()) : [],
      stepsFromMainGate: safeNum(newSteps),
      x: safeNum(newX),
      y: safeNum(newY),
      floorPlan: floorPlan || null,
    };

    let updated;
    if (editingId === null) {
      updated = [...buildings, buildingObj];
    } else {
      updated = buildings.map((b) => (b.id === editingId ? buildingObj : b));
    }

    setBuildings(updated);
    saveToStorage(updated);
    setModalVisible(false);
  };

  const deleteBuilding = (id) => {
    Alert.alert("Delete Building?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const updated = buildings.filter((b) => b.id !== id);
          setBuildings(updated);
          saveToStorage(updated);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>Manage Campus Buildings</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Campus Buildings</Text>

          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.buildingList}>
          {buildings.map((bldg) => (
            <View key={bldg.id} style={styles.buildingCard}>
              <View
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <View>
                  <Text style={styles.buildingName}>{bldg.name}</Text>
                  <Text style={styles.buildingDept}>{bldg.department}</Text>
                </View>

                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => openEditModal(bldg)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="create-outline" size={22} color="#6a11cb" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => deleteBuilding(bldg.id)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={22} color="red" />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={{ color: "#555", marginTop: 5 }}>
                Steps: {bldg.stepsFromMainGate}
              </Text>

              <Text style={{ color: "#555" }}>
                Coordinates: (x: {bldg.x}, y: {bldg.y})
              </Text>

              {bldg.floorPlan && (
                <Image
                  source={{ uri: bldg.floorPlan }}
                  style={{ width: "100%", height: 150, marginTop: 8, borderRadius: 8 }}
                />
              )}

              <View style={styles.roomContainer}>
                {bldg.rooms.map((room, idx) => (
                  <Text key={idx} style={styles.roomBox}>
                    {room}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingId ? "Edit Building" : "Add New Building"}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Building Name"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="Department"
              value={newDept}
              onChangeText={setNewDept}
            />
            <TextInput
              style={styles.input}
              placeholder="Rooms (comma separated)"
              value={newRooms}
              onChangeText={setNewRooms}
            />
            <TextInput
              style={styles.input}
              placeholder="Steps From Main Gate"
              keyboardType="numeric"
              value={newSteps}
              onChangeText={setNewSteps}
            />
            <TextInput
              style={styles.input}
              placeholder="X Position"
              keyboardType="numeric"
              value={newX}
              onChangeText={setNewX}
            />
            <TextInput
              style={styles.input}
              placeholder="Y Position"
              keyboardType="numeric"
              value={newY}
              onChangeText={setNewY}
            />

            {/* Upload Floor Plan */}
            <View style={{ marginBottom: 10 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: "#6a11cb",
                  padding: 10,
                  borderRadius: 8,
                  alignItems: "center",
                  marginBottom: 5,
                }}
                onPress={pickImage}
              >
                <Text style={{ color: "#fff" }}>
                  {floorPlan ? "Change Floor Plan" : "Upload Floor Plan"}
                </Text>
              </TouchableOpacity>
              {floorPlan && (
                <Image
                  source={{ uri: floorPlan }}
                  style={{ width: "100%", height: 150, borderRadius: 8 }}
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.addBuildingBtn}
              onPress={saveBuilding}
            >
              <Text style={styles.addBuildingText}>
                {editingId ? "Save Changes" : "Add Building"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomItem}>
          <Ionicons name="business" size={22} color="#6a11cb" />
          <Text style={styles.bottomLabel}>Buildings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomItem}
          onPress={() => navigation.replace("Login")}
        >
          <Ionicons name="log-out-outline" size={22} color="#444" />
          <Text style={styles.bottomLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6ff" },
  headerCard: {
    margin: 20,
    padding: 20,
    borderRadius: 15,
    backgroundColor: "#6a11cb",
    elevation: 5,
  },
  headerTitle: { fontSize: 22, color: "#fff", fontWeight: "bold" },
  headerSubtitle: { fontSize: 16, color: "#eee" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  addButton: {
    backgroundColor: "#6a11cb",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  buildingList: { padding: 20 },
  buildingCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 3,
  },
  buildingName: { fontSize: 18, fontWeight: "bold", color: "#333" },
  buildingDept: { fontSize: 14, color: "#666" },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  roomContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  roomBox: {
    backgroundColor: "#e8e3ff",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    margin: 3,
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  input: {
    backgroundColor: "#f1f1f1",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  addBuildingBtn: {
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  addBuildingText: { color: "#fff", fontSize: 16 },
  cancelBtn: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#ccc",
  },
  cancelText: { fontSize: 16, color: "#333" },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#ddd",
  },
  bottomItem: { alignItems: "center" },
  bottomLabel: { fontSize: 12, color: "#444", marginTop: 3 },
});
