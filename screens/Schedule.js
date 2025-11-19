import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Schedule() {
  const [schedule, setSchedule] = useState([
    {
      id: 1,
      day: "Monday",
      subject: "Web Development",
      time: "10:00 AM - 11:30 AM",
      room: "B2 - IT Building",
      prof: "Prof. Garcia",
    },
    {
      id: 2,
      day: "Monday",
      subject: "Data Structures",
      time: "8:00 AM - 9:30 AM",
      room: "D3 - Technology Building",
      prof: "Prof. Smith",
    },
    {
      id: 3,
      day: "Tuesday",
      subject: "Mobile App Development",
      time: "1:00 PM - 2:30 PM",
      room: "C5 - Technology Building",
      prof: "Prof. Santos",
    },
  ]);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState(null);

  const openEditModal = (item) => {
    setEditData(item);
    setEditModalVisible(true);
  };

  const saveEdit = () => {
    setSchedule(
      schedule.map((c) => (c.id === editData.id ? editData : c))
    );
    setEditModalVisible(false);
  };

  const deleteClass = (id) => {
    setSchedule(schedule.filter((item) => item.id !== id));
  };

  const groupByDay = schedule.reduce((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>My Schedule</Text>
          <Text style={styles.subtitle}>{schedule.length} classes this semester</Text>
        </View>

        {Object.keys(groupByDay).map((day) => (
          <View key={day}>
            <Text style={styles.dayTitle}>{day}</Text>

            {groupByDay[day].map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subject}>{item.subject}</Text>

                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity onPress={() => openEditModal(item)}>
                      <Ionicons name="create-outline" size={20} color="#007AFF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => deleteClass(item.id)}>
                      <Ionicons name="trash-outline" size={20} color="red" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.info}>⏰ {item.time}</Text>
                <Text style={styles.info}>📍 {item.room}</Text>
                <Text style={styles.info}>👨‍🏫 {item.prof}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* ---------------------- EDIT MODAL ---------------------- */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Schedule</Text>

            <TextInput
              style={styles.input}
              value={editData?.subject}
              onChangeText={(t) => setEditData({ ...editData, subject: t })}
              placeholder="Subject"
            />

            <TextInput
              style={styles.input}
              value={editData?.time}
              onChangeText={(t) => setEditData({ ...editData, time: t })}
              placeholder="Time"
            />

            <TextInput
              style={styles.input}
              value={editData?.room}
              onChangeText={(t) => setEditData({ ...editData, room: t })}
              placeholder="Room"
            />

            <TextInput
              style={styles.input}
              value={editData?.prof}
              onChangeText={(t) => setEditData({ ...editData, prof: t })}
              placeholder="Professor"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#007AFF" }]}
                onPress={saveEdit}
              >
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#aaa" }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ------------------- STYLES -------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  header: {
    backgroundColor: "#1E75FF",
    padding: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  subtitle: { color: "#dbe7ff", marginTop: 4 },

  dayTitle: {
    marginTop: 20,
    marginLeft: 20,
    fontSize: 18,
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 15,
    borderRadius: 15,
    elevation: 2,
  },

  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  subject: { fontSize: 16, fontWeight: "bold" },
  info: { marginTop: 6, color: "#555" },

  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
    elevation: 5,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },

  input: {
    backgroundColor: "#F1F1F1",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },

  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },

  btn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 5,
    alignItems: "center",
  },

  btnText: { color: "#fff", fontWeight: "bold" },
});
