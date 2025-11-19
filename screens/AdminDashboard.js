// AdminDashboard.js
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";  // <-- FIX

export default function AdminDashboard() {
  const navigation = useNavigation(); // <-- FIX

  const [buildings, setBuildings] = useState([
    {
      id: 1,
      name: "Technology Building",
      department: "College of Technology",
      rooms: ["D1", "D2", "D3", "D4", "D5"],
    },
    {
      id: 2,
      name: "IT Building",
      department: "Information Technology",
      rooms: ["A1", "A2", "B1", "B2", "C1"],
    },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newRooms, setNewRooms] = useState("");

  const addBuilding = () => {
    if (!newName.trim()) return;

    const newBuilding = {
      id: buildings.length + 1,
      name: newName,
      department: newDept,
      rooms: newRooms.split(",").map((r) => r.trim()),
    };

    setBuildings([...buildings, newBuilding]);
    setModalVisible(false);
    setNewName("");
    setNewDept("");
    setNewRooms("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>System Management</Text>
        </View>

        {/* Building Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Campus Buildings</Text>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.buildingList}>
          {buildings.map((bldg) => (
            <View key={bldg.id} style={styles.buildingCard}>
              <Text style={styles.buildingName}>{bldg.name}</Text>
              <Text style={styles.buildingDept}>{bldg.department}</Text>

              <View style={styles.roomContainer}>
                {bldg.rooms.map((room, index) => (
                  <Text key={index} style={styles.roomBox}>
                    {room}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add New Building Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Building</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Engineering Building"
              value={newName}
              onChangeText={setNewName}
            />

            <TextInput
              style={styles.input}
              placeholder="e.g. College of Engineering"
              value={newDept}
              onChangeText={setNewDept}
            />

            <TextInput
              style={styles.input}
              placeholder="e.g. E1, E2, E3, Lab 1"
              value={newRooms}
              onChangeText={setNewRooms}
            />

            <TouchableOpacity
              style={styles.addBuildingBtn}
              onPress={addBuilding}
            >
              <Text style={styles.addBuildingText}>Add Building</Text>
            </TouchableOpacity>

            {/* CANCEL BUTTON */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomItem}>
          <Ionicons name="business" size={22} color="#6a11cb" />
          <Text style={styles.bottomLabel}>Buildings</Text>
        </TouchableOpacity>

        {/* LOGOUT FIX */}
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
  container: {
    flex: 1,
    backgroundColor: "#f4f6ff",
  },

  headerCard: {
    margin: 20,
    padding: 20,
    borderRadius: 15,
    backgroundColor: "#6a11cb",
    elevation: 5,
  },

  headerTitle: {
    fontSize: 22,
    color: "#fff",
    fontWeight: "bold",
  },

  headerSubtitle: {
    fontSize: 16,
    color: "#eee",
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },

  addButton: {
    backgroundColor: "#6a11cb",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  buildingList: {
    padding: 20,
  },

  buildingCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 3,
  },

  buildingName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },

  buildingDept: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },

  roomContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
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

  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },

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

  addBuildingText: {
    color: "#fff",
    fontSize: 16,
  },

  cancelBtn: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#ccc",
  },

  cancelText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "bold",
  },

  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#ddd",
  },

  bottomItem: {
    alignItems: "center",
  },

  bottomLabel: {
    fontSize: 12,
    color: "#444",
    marginTop: 3,
  },
});
