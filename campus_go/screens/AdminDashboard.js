// AdminDashboard.js (Option 3: Gates as separate item type + image picker)
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
  Switch,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BuildingsContext } from "./BuildingsContext";
import * as ImagePicker from "expo-image-picker";

const TYPE_PRESETS = [
  { key: "general", label: "General" },
  { key: "office", label: "Office" },
  { key: "roomsOnly", label: "Rooms only" },
];

const COLOR_PRESETS = ["#1faa59", "#6a11cb", "#ff8800", "#4fc3f7", "#ffd54f", "#e57373"];

export default function AdminDashboard() {
  const navigation = useNavigation();
  const { buildings, setBuildings } = useContext(BuildingsContext);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // New: choose whether adding a "building" or "gate"
  const [addKind, setAddKind] = useState("building"); // 'building' | 'gate' | 'court' | 'tree'

  // building fields
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newRooms, setNewRooms] = useState("");
  const [newSteps, setNewSteps] = useState("");
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [floorPlan, setFloorPlan] = useState(null);
  const [photo, setPhoto] = useState(null); // exterior / facade photo
  const [newType, setNewType] = useState("general");
  const [newColor, setNewColor] = useState("#1faa59");

  // gate fields (separate)
  const [gateIcon, setGateIcon] = useState(null);
  const [gateIsPrimary, setGateIsPrimary] = useState(false);

  // court fields
  const [newCourtType, setNewCourtType] = useState("basketball"); // 'basketball' | 'volleyball'

  // tree fields
  const [newTreeSpecies, setNewTreeSpecies] = useState("");
  const [newTreeColor, setNewTreeColor] = useState("#1faa59");
  // generic other item color
  const [newOtherMeta, setNewOtherMeta] = useState("");

  // utility
  const safeNum = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  // compute image max height so previews never overflow the modal
  const SCREEN_HEIGHT = Dimensions.get("window").height;
  const SCREEN_WIDTH = Dimensions.get("window").width;
  const MODAL_INNER_WIDTH = Math.round(SCREEN_WIDTH * 0.92);
  const PREVIEW_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.36); // ~36% of screen

  // Load buildings/gates, ensure defaults & backward compatibility
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem("campusBuildings");
        if (stored) {
          const parsed = JSON.parse(stored).map((b) => ({
            ...b,
            // backwards compat: older items may not have 'kind'
            kind: b.kind || "building",
            x: safeNum(b.x),
            y: safeNum(b.y),
            stepsFromMainGate: safeNum(b.stepsFromMainGate),
            rooms: Array.isArray(b.rooms) ? b.rooms : typeof b.rooms === "string" ? b.rooms.split(",").map(r => r.trim()) : [],
            floorPlan: b.floorPlan || null,
            type: b.type || "general",
            color: b.color || "#1faa59",
            isMainGate: !!b.isMainGate || (b.kind === "gate" && !!b.isMainGate),
            gateIcon: b.gateIcon || null,
          }));
          setBuildings(parsed);
        } else {
          // initialize from context if available (ensure defaults)
          const safe = (buildings || []).map((b) => ({
            ...b,
            kind: b.kind || "building",
            x: safeNum(b.x),
            y: safeNum(b.y),
            stepsFromMainGate: safeNum(b.stepsFromMainGate),
            rooms: Array.isArray(b.rooms) ? b.rooms : [],
            floorPlan: b.floorPlan || null,
            type: b.type || "general",
            color: b.color || "#1faa59",
            isMainGate: !!b.isMainGate,
            gateIcon: b.gateIcon || null,
          }));
          setBuildings(safe);
        }
      } catch (e) {
        console.log("LOAD ERROR:", e);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToStorage = async (data) => {
    try {
      await AsyncStorage.setItem("campusBuildings", JSON.stringify(data));
    } catch (e) {
      console.log("SAVE ERROR:", e);
    }
  };

  const openAddModal = (kind = "building") => {
    setAddKind(kind);
    setEditingId(null);
    // reset fields
    setNewName("");
    setNewDept("");
    setNewRooms("");
    setNewSteps("");
    setNewX("");
    setNewY("");
    setFloorPlan(null);
    setPhoto(null);
    setNewType("general");
    setNewColor("#1faa59");
    setGateIcon(null);
    setGateIsPrimary(false);
    setNewCourtType("basketball");
    setNewTreeSpecies("");
    setNewTreeColor("#1faa59");
    setModalVisible(true);
  };

  // edit either building or gate
  const openEditModal = (item) => {
    setEditingId(item.id);
    setAddKind(item.kind || "building");
    setNewName(item.name || "");
    setNewDept(item.department || "");
    setNewRooms(Array.isArray(item.rooms) ? item.rooms.join(", ") : item.rooms || "");
    setNewSteps(String(item.stepsFromMainGate || ""));
    setNewX(String(item.x || ""));
    setNewY(String(item.y || ""));
    setFloorPlan(item.floorPlan || null);
    setPhoto(item.photo || null);
    setNewType(item.type || "general");
    setNewColor(item.color || "#1faa59");
    setGateIcon(item.gateIcon || null);
    setGateIsPrimary(!!item.isMainGate);
    setModalVisible(true);
  };

  const pickImage = async (forGate = false) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Permission is required to access photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (forGate === true) setGateIcon(uri);
      else if (forGate === 'photo') setPhoto(uri);
      else setFloorPlan(uri);
    }
  };

  const saveItem = async () => {
    if (!newName.trim()) {
      Alert.alert("Validation", "Please provide a name.");
      return;
    }

    const existing = buildings || [];
    // generate id (numeric if possible)
    const newId =
      editingId ??
      (existing.length ? Math.max(...existing.map((b) => Number(b.id) || 0)) + 1 : Date.now());

    let updated = [...existing];

    if (addKind === "gate") {
      // If this gate set as primary, unset other primary gates
      if (gateIsPrimary) {
        updated = updated.map((it) => (it.kind === "gate" ? { ...it, isMainGate: false } : it));
      }

      const obj = {
        id: newId,
        kind: "gate",
        name: newName.trim(),
        x: safeNum(newX),
        y: safeNum(newY),
        gateIcon: gateIcon || null,
        isMainGate: !!gateIsPrimary,
      };

      if (editingId === null) updated.push(obj);
      else updated = updated.map((it) => (it.id === editingId ? obj : it));
    } else {
      // building | court | tree
      if (addKind === 'building') {
        // default to a visible-ish location if coords are not provided
        const defaultX = safeNum(newX) || 220;
        const defaultY = safeNum(newY) || 80;
        const obj = {
          id: newId,
          kind: "building",
          name: newName.trim(),
          department: newDept.trim(),
          rooms: newRooms ? newRooms.split(",").map((r) => r.trim()) : [],
          stepsFromMainGate: safeNum(newSteps),
          x: defaultX,
          y: defaultY,
          floorPlan: floorPlan || null,
          photo: photo || null,
          type: newType || "general",
          color: newColor || "#1faa59",
          isMainGate: false,
        };
        if (editingId === null) updated.push(obj);
        else updated = updated.map((it) => (it.id === editingId ? obj : it));
      } else if (addKind === 'court') {
        const obj = {
          id: newId,
          kind: 'court',
          name: newName.trim(),
          courtType: newCourtType || 'basketball',
          x: safeNum(newX) || 220,
          y: safeNum(newY) || 120,
          color: '#d9b382',
        };
        if (editingId === null) updated.push(obj);
        else updated = updated.map((it) => (it.id === editingId ? obj : it));
      } else if (addKind === 'tree') {
        const obj = {
          id: newId,
          kind: 'tree',
          name: newName.trim(),
          species: newTreeSpecies || null,
          x: safeNum(newX) || 140,
          y: safeNum(newY) || 140,
          color: newTreeColor || '#1faa59',
        };
        if (editingId === null) updated.push(obj);
        else updated = updated.map((it) => (it.id === editingId ? obj : it));
      } else if (addKind === 'other') {
        const obj = {
          id: newId,
          kind: 'other',
          name: newName.trim(),
          meta: newOtherMeta || null,
          x: safeNum(newX) || 180,
          y: safeNum(newY) || 120,
          color: newColor || '#9c27b0',
        };
        if (editingId === null) updated.push(obj);
        else updated = updated.map((it) => (it.id === editingId ? obj : it));
      }
    }

    setBuildings(updated);
    // ensure AsyncStorage write completes before closing modal so other screens
    // that read from storage (or a storage-first loader) see the latest data
    await saveToStorage(updated);
    // quick confirmation for debugging: alert saved kind and coords
    try {
      const saved = updated.find((it) => it.id === newId);
      if (saved) {
        Alert.alert("Saved", `${saved.kind} "${saved.name}" saved at (${saved.x}, ${saved.y})`);
      }
    } catch (e) {
      console.log("SAVE CONFIRM ERROR", e);
    }
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert("Delete item?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const updated = (buildings || []).filter((b) => b.id !== id);
          setBuildings(updated);
          saveToStorage(updated);
        },
      },
    ]);
  };

  // small UI helpers
  const TypeChooser = () => (
    <View style={{ flexDirection: "row", marginBottom: 8 }}>
      {TYPE_PRESETS.map((t) => (
        <TouchableOpacity
          key={t.key}
          onPress={() => setNewType(t.key)}
          style={[
            styles.typeBtn,
            newType === t.key ? { backgroundColor: "#333" } : { backgroundColor: "#eee" },
          ]}
        >
          <Text style={{ color: newType === t.key ? "#fff" : "#333", fontWeight: "700" }}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const ColorChooser = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
      {COLOR_PRESETS.map((c) => (
        <TouchableOpacity
          key={c}
          onPress={() => setNewColor(c)}
          style={[styles.colorSwatch, { backgroundColor: c, borderWidth: newColor === c ? 3 : 0, borderColor: "#222" }]}
        />
      ))}
      <TextInput
        value={newColor}
        onChangeText={(t) => setNewColor(t.startsWith("#") ? t : `#${t}`)}
        placeholder="#rrggbb"
        style={[styles.input, { width: 110, paddingHorizontal: 8 }]}
      />
    </View>
  );

  const allItems = buildings || [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>Manage Campus Buildings & Gates</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.addButton} onPress={() => openAddModal("building")}>
              <Ionicons name="business" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Building</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, { backgroundColor: "#2a7dff" }]} onPress={() => openAddModal("gate")}>
              <Ionicons name="log-in" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Gate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, { backgroundColor: "#ff8800" }]} onPress={() => openAddModal("court") }>
              <Ionicons name="ios-snow" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Court</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, { backgroundColor: "#4fc3f7" }]} onPress={() => openAddModal("tree") }>
              <Ionicons name="leaf" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Tree</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, { backgroundColor: "#9c27b0" }]} onPress={() => openAddModal("other") }>
              <Ionicons name="apps" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Other</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.buildingList}>
          {allItems.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  {it.kind === "gate" ? (
                    <View style={{ alignItems: "center" }}>
                      <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: it.gateIcon ? "transparent" : "#2a7dff", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                        {it.gateIcon ? (
                          <Image source={{ uri: it.gateIcon }} style={{ width: 46, height: 46, resizeMode: "cover" }} />
                        ) : (
                          <Ionicons name="log-in" size={20} color="#fff" />
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{it.isMainGate ? "Primary" : "Gate"}</Text>
                    </View>
                  ) : it.kind === 'court' ? (
                    <View style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: it.color || '#d9b382', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="basketball" size={20} color="#fff" />
                    </View>
                  ) : it.kind === 'tree' ? (
                    <View style={{ width: 46, height: 46, borderRadius: 999, backgroundColor: it.color || '#1faa59' }} />
                  ) : (
                    <View style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: it.color || "#1faa59" }} />
                  )}

                  <View>
                    <Text style={styles.itemTitle}>{it.name}</Text>
                    {it.kind === "building" && <Text style={styles.itemSub}>{it.department || ""}</Text>}
                    <Text style={{ color: "#666", fontSize: 12 }}>{it.kind === "gate" ? `Position: (${it.x}, ${it.y})` : `Coords: (${it.x}, ${it.y}) • Steps: ${it.stepsFromMainGate || 0}`}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity onPress={() => openEditModal(it)} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={20} color="#6a11cb" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(it.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={20} color="red" />
                  </TouchableOpacity>
                </View>
              </View>

              {it.kind === "building" && it.rooms && Array.isArray(it.rooms) && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                  {it.rooms.map((r, i) => <Text key={i} style={styles.roomBox}>{r}</Text>)}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <SafeAreaView style={styles.modalInner} edges={["top", "bottom"]}>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.modalTitle}>{editingId ? "Edit Item" : addKind === "gate" ? "Add Gate" : addKind === 'court' ? 'Add Court' : addKind === 'tree' ? 'Add Tree' : addKind === 'other' ? 'Add Other' : 'Add Building'}</Text>

              <TextInput style={styles.input} placeholder="Name" value={newName} onChangeText={setNewName} />

              {/* building fields */}
              {addKind === "building" && (
                <>
                  <TextInput style={styles.input} placeholder="Department" value={newDept} onChangeText={setNewDept} />
                  <TextInput style={styles.input} placeholder="Rooms (comma separated)" value={newRooms} onChangeText={setNewRooms} />
                  <TextInput style={styles.input} placeholder="Steps From Main Gate" keyboardType="numeric" value={newSteps} onChangeText={setNewSteps} />
                  <TextInput style={styles.input} placeholder="X Position" keyboardType="numeric" value={newX} onChangeText={setNewX} />
                  <TextInput style={styles.input} placeholder="Y Position" keyboardType="numeric" value={newY} onChangeText={setNewY} />

                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>Type</Text>
                    <View style={{ flexDirection: "row" }}>
                      <TypeChooser />
                    </View>
                  </View>

                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>Color</Text>
                    <ColorChooser />
                  </View>

                  <View style={{ marginBottom: 10 }}>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(false)}>
                      <Text style={{ color: "#fff" }}>{floorPlan ? "Change Floor Plan" : "Upload Floor Plan"}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginBottom: 10 }}>
                    <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: '#2a7dff' }]} onPress={() => pickImage('photo')}>
                      <Text style={{ color: "#fff" }}>{photo ? "Change Exterior Photo" : "Upload Exterior Photo"}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Combined horizontal carousel for previews (prevents vertical overflow) */}
                  {(floorPlan || photo) && (
                    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }} style={{ width: '100%', marginTop: 8 }}>
                      {floorPlan && (
                        <View style={{ width: MODAL_INNER_WIDTH - 32, paddingRight: 12 }}>
                          <Image source={{ uri: floorPlan }} style={{ width: "100%", height: PREVIEW_MAX_HEIGHT, borderRadius: 8 }} resizeMode="contain" />
                        </View>
                      )}
                      {photo && (
                        <View style={{ width: MODAL_INNER_WIDTH - 32, paddingLeft: 12 }}>
                          <Image source={{ uri: photo }} style={{ width: "100%", height: PREVIEW_MAX_HEIGHT, borderRadius: 8 }} resizeMode="cover" />
                        </View>
                      )}
                    </ScrollView>
                  )}
                </>
              )}

              {/* gate fields */}
              {addKind === "gate" && (
                <>
                  <Text style={{ color: "#666", marginBottom: 6 }}>Gate position</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="X Position" keyboardType="numeric" value={newX} onChangeText={setNewX} />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Y Position" keyboardType="numeric" value={newY} onChangeText={setNewY} />
                  </View>

                  <View style={{ marginVertical: 8 }}>
                    <Text style={{ fontWeight: "700", marginBottom: 6 }}>Gate Icon (optional)</Text>
                    <TouchableOpacity style={styles.uploadBtnAlt} onPress={() => pickImage(true)}>
                      <Text style={{ color: "#fff" }}>{gateIcon ? "Change Gate Icon" : "Upload Gate Icon"}</Text>
                    </TouchableOpacity>
                    {gateIcon && <Image source={{ uri: gateIcon }} style={{ width: 120, height: 80, borderRadius: 8, marginTop: 8 }} />}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <View>
                      <Text style={{ fontWeight: "700" }}>Primary Gate?</Text>
                      <Text style={{ color: "#666", fontSize: 12 }}>If on, this becomes the campus entrance  {"\n"} for centering & routes.</Text>
                    </View>
                    <Switch value={gateIsPrimary} onValueChange={setGateIsPrimary} />
                  </View>
                </>
              )}

              {/* Court-specific */}
              {addKind === "court" && (
                <>
                  <Text style={{ fontWeight: "700", marginBottom: 6 }}>Court Type</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <TouchableOpacity onPress={() => setNewCourtType('basketball')} style={[styles.typeBtn, newCourtType === 'basketball' ? { backgroundColor: '#333' } : { backgroundColor: '#eee' }]}>
                      <Text style={{ color: newCourtType === 'basketball' ? '#fff' : '#333', fontWeight: '700' }}>Basketball</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setNewCourtType('volleyball')} style={[styles.typeBtn, newCourtType === 'volleyball' ? { backgroundColor: '#333' } : { backgroundColor: '#eee' }]}>
                      <Text style={{ color: newCourtType === 'volleyball' ? '#fff' : '#333', fontWeight: '700' }}>Volleyball</Text>
                    </TouchableOpacity>
                     <TouchableOpacity onPress={() => setNewCourtType('others')} style={[styles.typeBtn, newCourtType === 'others' ? { backgroundColor: '#333' } : { backgroundColor: '#eee' }]}>
                      <Text style={{ color: newCourtType === 'others' ? '#fff' : '#333', fontWeight: '700' }}>Others</Text>
                      </TouchableOpacity>
                  </View>

                  <TextInput style={styles.input} placeholder="X Position" keyboardType="numeric" value={newX} onChangeText={setNewX} />
                  <TextInput style={styles.input} placeholder="Y Position" keyboardType="numeric" value={newY} onChangeText={setNewY} />
                </>
              )}

              {/* Tree-specific */}
              {addKind === "tree" && (
                <>
                  <TextInput style={styles.input} placeholder="Tree Species (optional)" value={newTreeSpecies} onChangeText={setNewTreeSpecies} />
                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>Color</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {COLOR_PRESETS.map((c) => (
                      <TouchableOpacity key={c} onPress={() => setNewTreeColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderWidth: newTreeColor === c ? 3 : 0 }]} />
                    ))}
                    <TextInput value={newTreeColor} onChangeText={(t) => setNewTreeColor(t.startsWith('#') ? t : `#${t}`)} placeholder="#rrggbb" style={[styles.input, { width: 110, paddingHorizontal: 8 }]} />
                  </View>
                  <TextInput style={styles.input} placeholder="X Position" keyboardType="numeric" value={newX} onChangeText={setNewX} />
                  <TextInput style={styles.input} placeholder="Y Position" keyboardType="numeric" value={newY} onChangeText={setNewY} />
                </>
              )}

              {/* Other-specific */}
              {addKind === "other" && (
                <>
                  <TextInput style={styles.input} placeholder="Meta / Notes (optional)" value={newOtherMeta} onChangeText={setNewOtherMeta} />
                  <Text style={{ fontWeight: '700', marginBottom: 6 }}>Color</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {COLOR_PRESETS.map((c) => (
                      <TouchableOpacity key={c} onPress={() => setNewColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderWidth: newColor === c ? 3 : 0 }]} />
                    ))}
                    <TextInput value={newColor} onChangeText={(t) => setNewColor(t.startsWith('#') ? t : `#${t}`)} placeholder="#rrggbb" style={[styles.input, { width: 110, paddingHorizontal: 8 }]} />
                  </View>
                  <TextInput style={styles.input} placeholder="X Position" keyboardType="numeric" value={newX} onChangeText={setNewX} />
                  <TextInput style={styles.input} placeholder="Y Position" keyboardType="numeric" value={newY} onChangeText={setNewY} />
                </>
              )}
            </ScrollView>

            {/* Sticky footer so Save/Cancel are always reachable */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.footerPrimary, styles.modalFooterButton]} onPress={saveItem}>
                <Text style={styles.addBuildingText}>{editingId ? "Save Changes" : addKind === "gate" ? "Add Gate" : addKind === 'court' ? 'Add Court' : addKind === 'tree' ? 'Add Tree' : addKind === 'other' ? 'Add Other' : 'Add Building'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.footerSecondary, styles.modalFooterButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomItem}>
          <Ionicons name="business" size={22} color="#6a11cb" />
          <Text style={styles.bottomLabel}>Items</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomItem} onPress={() => navigation.replace("Login")}>
          <Ionicons name="log-out-outline" size={22} color="#444" />
          <Text style={styles.bottomLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6ff" },
  headerCard: { margin: 20, padding: 20, borderRadius: 15, backgroundColor: "#6a11cb", elevation: 6 },
  headerTitle: { fontSize: 22, color: "#fff", fontWeight: "bold" },
  headerSubtitle: { fontSize: 16, color: "#eee", marginTop: 6 },
  buttonRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 20, marginTop: 10 },
  addButton: { backgroundColor: "#1faa59", flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "700", marginLeft: 6 },
  buildingList: { padding: 16 },
  itemCard: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 12, elevation: 3 },
  itemTitle: { fontSize: 16, fontWeight: "700" },
  itemSub: { fontSize: 13, color: "#666" },
  iconBtn: { padding: 8, borderRadius: 8, marginLeft: 6 },
  roomBox: { backgroundColor: "#e8e3ff", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, margin: 3, fontSize: 13 },
  modalContainer: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  modalContent: { width: "100%", backgroundColor: "transparent", padding: 0, borderRadius: 12, flex: 1 },
  modalInner: { width: "92%", height: '85%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', flexDirection: 'column', paddingBottom: 92 },
  modalScroll: { width: '100%', flex: 1 },
  modalFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 12, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff', justifyContent: 'space-between' },
  modalFooterButton: { flex: 1, marginHorizontal: 6 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  input: { backgroundColor: "#f1f1f1", padding: Platform.OS === "ios" ? 12 : 8, borderRadius: 8, marginBottom: 10 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: 8 },
  colorSwatch: { width: 34, height: 34, borderRadius: 6, marginRight: 6 },
  uploadBtn: { backgroundColor: "#6a11cb", padding: 10, borderRadius: 8, alignItems: "center" },
  uploadBtnAlt: { backgroundColor: "#2a7dff", padding: 10, borderRadius: 8, alignItems: "center" },
  addBuildingBtn: { backgroundColor: "#000", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 8 },
  addBuildingText: { color: "#fff", fontSize: 16 },
  cancelBtn: { marginTop: 10, padding: 12, borderRadius: 8, alignItems: "center", backgroundColor: "#ccc" },
  footerPrimary: { backgroundColor: '#000', padding: 12, borderRadius: 8, alignItems: 'center' },
  footerSecondary: { backgroundColor: '#ccc', padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelText: { fontSize: 16, color: "#333" },
  bottomBar: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 12, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#ddd" },
  bottomItem: { alignItems: "center" },
  bottomLabel: { fontSize: 12, color: "#444", marginTop: 3 },
});
