
// VisitorMap.js — Version C: Google-Maps-accurate focal pinch + momentum + clamping
import React, { useContext, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Image,
  Easing,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { BuildingsContext } from "./BuildingsContext";
import Svg, { Polyline, Circle, Path, G, Rect, Polygon, Defs, LinearGradient, Stop, Ellipse, Text as SvgText } from "react-native-svg";
import { PinchGestureHandler, TapGestureHandler, State as GHState } from "react-native-gesture-handler";

const green = "#1faa59";
const lightGreen = "#dbffe3";
// We'll track window size inside the component to handle orientation changes.
// MAP_WIDTH / modal widths are computed per-render using current window size.
// Keep a default for any top-level code that might reference them (styles are updated accordingly).
const DEFAULT_MAP_HEIGHT = 500;

const TYPE_PRESETS = {
  general: "#ffffff",
  office: "#fff3e0",
  roomsOnly: "#e8e3ff",
};

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return { r: parseInt(c.substring(0, 2), 16), g: parseInt(c.substring(2, 4), 16), b: parseInt(c.substring(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1)}`;
}
function darken(hex, amt = 0.12) {
  try {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(Math.floor(r * (1 - amt)), Math.floor(g * (1 - amt)), Math.floor(b * (1 - amt)));
  } catch {
    return hex;
  }
}
function lighten(hex, amt = 0.12) {
  try {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(Math.floor(r + (255 - r) * amt), Math.floor(g + (255 - g) * amt), Math.floor(b + (255 - b) * amt));
  } catch {
    return hex;
  }
}

function VisitorMapInner({ navigation, route, focus, onFocusHandled }) {
  const [windowSize, setWindowSize] = useState(Dimensions.get("window"));
  useEffect(() => {
    const handler = ({ window }) => setWindowSize(window);
    const sub = Dimensions.addEventListener ? Dimensions.addEventListener("change", handler) : null;
    // older RN: fallback
    if (!sub) Dimensions.removeEventListener && Dimensions.addEventListener("change", handler);
    return () => {
      if (sub && typeof sub.remove === "function") sub.remove();
      else Dimensions.removeEventListener && Dimensions.removeEventListener("change", handler);
    };
  }, []);

  const SCREEN_WIDTH = windowSize.width;
  const SCREEN_HEIGHT = windowSize.height;
  const VISITOR_MODAL_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 380);
  const VISITOR_MODAL_INNER = Math.round(VISITOR_MODAL_CARD_WIDTH - 40);
  const MAP_WIDTH = SCREEN_WIDTH * 1.8;
  const MAP_HEIGHT = DEFAULT_MAP_HEIGHT;
  const { buildings } = useContext(BuildingsContext);
  const [search, setSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [localBuildings, setLocalBuildings] = useState([]);

  // alerts for sudden building changes (e.g., closed, maintenance, restricted)
  const [alerts, setAlerts] = useState([]);
  const prevBuildingsRef = useRef([]);

  // detect building-level status changes and queue lightweight in-app alerts
  useEffect(() => {
    try {
      const prev = prevBuildingsRef.current || [];
      const added = [];
      (buildings || []).forEach((b) => {
        const old = prev.find((p) => p.id === b.id);
        if (old && old.status !== b.status) {
          const newStatus = b.status || "updated";
          added.push({ id: b.id, title: b.name || "Building", message: `${b.name || 'Building'} status: ${newStatus}`, building: b });
        }
      });
      if (added.length) setAlerts((s) => [...added, ...s]);
      // store a shallow copy for next comparison
      prevBuildingsRef.current = (buildings || []).map((x) => ({ ...x }));
    } catch (e) {
      // ignore detection errors
    }
  }, [buildings]);

  // auto-expire alerts after N seconds
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;
    const timers = alerts.map((a) => setTimeout(() => setAlerts((prev) => prev.filter((x) => x !== a)), 12000));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [alerts]);

  

  // Floor plan modal visible state (we use this for list -> floor plan modal)
  const [floorPlanModalVisible, setFloorPlanModalVisible] = useState(false);

  // Force normal mode only (remove diorama mode)
  const mode = "normal";
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Add scrollViewRef to allow programmatic scrolling
  const scrollViewRef = useRef(null);

  // pan & pinch
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const scaleValueRef = useRef(1);
  useEffect(() => {
    const id = scale.addListener(({ value }) => (scaleValueRef.current = value));
    return () => scale.removeListener(id);
  }, [scale]);

  // pinch gesture handler state
  const pinchRef = useRef(null);
  const MIN_SCALE = 0.6;
  const MAX_SCALE = 3.0;
  // if true, don't force clamping/snap-back after gestures (allow free panning to edges)
  const FREE_PAN = true;
  // We'll implement an imperative pinch handler that keeps the focal point steady
  // (Google Maps style). We avoid using Animated.event for scale here because
  // we need the focalX/focalY to compute pan adjustments.
  const onPinchEvent = (ev) => {
    const ne = ev.nativeEvent || {};
    const s = typeof ne.scale === "number" ? ne.scale : 1;
    const focalX = typeof ne.focalX === "number" ? ne.focalX : null;
    const focalY = typeof ne.focalY === "number" ? ne.focalY : null;

    // if layout not ready, just set scale proportionally
    if (!mapLayout || focalX === null || focalY === null) {
      const tentative = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleValueRef.current * s));
      scale.setValue(tentative);
      return;
    }

    // initialize pinch center when first seeing a gesture
    if (!pinchCenterRef.current) {
      const offsetX = getPanX();
      const offsetY = getPanY();
      pinchCenterRef.current = {
        x: (focalX - mapLayout.x - offsetX) / scaleValueRef.current,
        y: (focalY - mapLayout.y - offsetY) / scaleValueRef.current,
      };
      // mark pinch active
      pinchActiveRef.current = true;
    }

    // compute new scale and clamp
    let newScale = scaleValueRef.current * s;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    const focal = pinchCenterRef.current;
    if (focal) {
      const oldScale = scaleValueRef.current;
      const beforeX = focal.x * oldScale + lastPan.current.x;
      const beforeY = focal.y * oldScale + lastPan.current.y;

      const afterX = focal.x * newScale + lastPan.current.x;
      const afterY = focal.y * newScale + lastPan.current.y;

      const dxPan = beforeX - afterX;
      const dyPan = beforeY - afterY;

      // compute the absolute target pan (relative to lastPan)
      const targetX = lastPan.current.x + dxPan;
      const targetY = lastPan.current.y + dyPan;

      // apply directly to pan values (respect existing offset semantics)
      try {
        pan.x.setValue(targetX - (pan.x._offset || 0));
        pan.y.setValue(targetY - (pan.y._offset || 0));
      } catch (e) {
        pan.setValue({ x: targetX - (pan.x._offset || 0), y: targetY - (pan.y._offset || 0) });
      }
    }

    scale.setValue(newScale);
  };

  // If navigation provided a building/room to focus, center and open it once localBuildings are loaded
  React.useEffect(() => {
    try {
      const params = (route && route.params) || focus || {};
      const bname = params.building;
      const rname = params.room;
      if (!bname || !localBuildings || localBuildings.length === 0) return;
      const q = String(bname).toLowerCase().trim();

      const normalize = (s) => (String(s || "").toLowerCase().replace(/\b(building|bldg|blg)\b/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim());

      const tryFindMatch = (arr) => {
        if (!arr || !arr.length) return null;
        // 1) exact match (case-insensitive)
        let found = arr.find((bb) => (bb.name || "").toLowerCase() === q);
        if (found) return found;

        // 2) includes match only for longer queries (avoid short substrings matching wrong names)
        if (q.length >= 4 || q.indexOf(" ") !== -1) {
          found = arr.find((bb) => (bb.name || "").toLowerCase().includes(q));
          if (found) return found;
        }

        // 3) normalized compare (remove 'building' etc)
        const nq = normalize(q);
        found = arr.find((bb) => normalize(bb.name) === nq);
        if (found) return found;

        if (nq.length >= 4 || nq.indexOf(" ") !== -1) {
          found = arr.find((bb) => normalize(bb.name).includes(nq) || nq.includes(normalize(bb.name)));
          if (found) return found;
        }

        // 4) token-match: require exact token equality for short tokens (<3), allow substring for longer tokens
        const qTokens = (nq || "").split(" ").filter(Boolean);
        if (qTokens.length) {
          found = arr.find((bb) => {
            const nn = normalize(bb.name || "");
            const nameTokens = nn.split(" ").filter(Boolean);
            return qTokens.every((t) => {
              if (t.length < 3) {
                return nameTokens.includes(t);
              }
              return nameTokens.some((nt) => nt.includes(t));
            });
          });
          if (found) return found;
        }

        return null;
      };

      let match = tryFindMatch(localBuildings) || tryFindMatch(buildings || []);

      const ensureImagesFromStorage = async (candidate) => {
        try {
          if (!candidate) return candidate;
          // if candidate already has a photo or floorPlan, return it
          if (candidate.photo || candidate.floorPlan) return candidate;
          const stored = await AsyncStorage.getItem("campusBuildings");
          if (!stored) return candidate;
          const parsed = JSON.parse(stored || "[]");
          const found = parsed.find((p) => (p.id && candidate.id && p.id === candidate.id) || normalize(p.name || "") === normalize(candidate.name || "") || (p.name || "").toLowerCase().includes(q) );
          if (found) return { ...candidate, ...found };
          // if not found by id/name, try to find any record matching q tokens
          const nq = normalize(q);
          if (!found) {
            const byTokens = parsed.find((p) => normalize(p.name || "").includes(nq) || (nq.split(" ").every(t => normalize(p.name || "").includes(t))));
            if (byTokens) return { ...candidate, ...byTokens };
          }
        } catch (e) {
          // ignore storage errors
        }
        return candidate;
      };

      (async () => {
        try {
          match = await ensureImagesFromStorage(match);
          if (!match) return;
          setTimeout(() => {
            try {
              centerOnBuilding(match);
              setSelectedBuilding(match);
              if (rname) setSelectedRoom(rname);
              setFloorPlanModalVisible(true);
              try { if (typeof onFocusHandled === 'function') onFocusHandled(); } catch (e) {}
            } catch (e) {
              // ignore
            }
          }, 140);
        } catch (e) {}
      })();
    } catch (e) {}
  }, [localBuildings, route && route.params, focus]);

  const onPinchStateChange = (ev) => {
    const s = ev.nativeEvent || {};
    if (s.state === GHState.END || s.oldState === GHState.ACTIVE) {
      // finalize base scale and clear the temporary pinch center
      let final = scaleValueRef.current;
      final = Math.max(MIN_SCALE, Math.min(MAX_SCALE, final));
      scale.setValue(final);
      scaleValueRef.current = final;
      // flatten offsets and store final pan into lastPan so future pans continue smoothly
      try {
        pan.flattenOffset();
      } catch (e) {}
      const finalX = (typeof pan.x.__getValue === "function" ? pan.x.__getValue() : pan.x._value) + (pan.x._offset || 0);
      const finalY = (typeof pan.y.__getValue === "function" ? pan.y.__getValue() : pan.y._value) + (pan.y._offset || 0);
      lastPan.current = { x: finalX, y: finalY };
      pinchCenterRef.current = null;
      // mark that a pinch just ended so we don't immediately clamp on the next pan release
      pinchActiveRef.current = false;
      pinchRecentlyRef.current = true;
      setTimeout(() => (pinchRecentlyRef.current = false), 400);
    }
  };

  const initialDistanceRef = useRef(null);
  const initialScaleRef = useRef(1);
  const lastPan = useRef({ x: 0, y: 0 });
  const gestureStartRef = useRef(0);
  // track pinch activity so we can avoid forcing clamps immediately after pinch
  const pinchActiveRef = useRef(false);
  const pinchRecentlyRef = useRef(false);

  // helpers to safely read current pan values (avoid fragile _value/_offset access)
  const getPanX = () => {
    try {
      const vx = typeof pan.x.__getValue === "function" ? pan.x.__getValue() : (pan.x._value || 0);
      const off = pan.x._offset || lastPan.current.x || 0;
      return vx + off;
    } catch {
      return lastPan.current.x || 0;
    }
  };
  const getPanY = () => {
    try {
      const vy = typeof pan.y.__getValue === "function" ? pan.y.__getValue() : (pan.y._value || 0);
      const off = pan.y._offset || lastPan.current.y || 0;
      return vy + off;
    } catch {
      return lastPan.current.y || 0;
    }
  };

  // spiderfy state: when a cluster is tapped expand members radially
  const [spiderfy, setSpiderfy] = useState(null);
  const handleClusterTap = (entry) => {
    try {
      if (!entry || entry.type !== 'cluster') return;
      const cx = Number(entry.x) || 0;
      const cy = Number(entry.y) || 0;
      if (spiderfy && spiderfy.center && spiderfy.center.x === cx && spiderfy.center.y === cy) {
        setSpiderfy(null);
        return;
      }
      const s = scaleValueRef.current || 1;
      const px = getPanX();
      const py = getPanY();
      const screenCenterX = cx * s + px;
      const screenCenterY = cy * s + py;
      const members = entry.members || [];
      const cnt = members.length || 0;
      const R = Math.min(140, 28 + cnt * 12);
      const positions = members.map((m, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, members.length);
        const sx = screenCenterX + R * Math.cos(angle);
        const sy = screenCenterY + R * Math.sin(angle);
        const mapX = (sx - px) / s;
        const mapY = (sy - py) / s;
        return { x: mapX, y: mapY, member: m };
      });
      setSpiderfy({ center: { x: cx, y: cy }, positions, entry });
    } catch (e) {
      // ignore
    }
  };

  const mapContainerRef = useRef(null);
  const [mapLayout, setMapLayout] = useState(null);
  const pinchCenterRef = useRef(null);

  // When the map layout and local buildings are ready, ensure the map is fitted
  // so newly added items are visible (helpful after admin adds a building).
  useEffect(() => {
    if (!mapLayout) return;
    if (!localBuildings || localBuildings.length === 0) return;
    // small delay to allow layout/animations to settle
    const id = setTimeout(() => {
      try { fitAll(); } catch (e) { /* ignore */ }
    }, 150);
    return () => clearTimeout(id);
  }, [mapLayout, localBuildings]);

  // for double-tap
  const lastTapRef = useRef(0);

  // room polygon overlays (normalized coordinates 0..1)
  const ROOM_POLYGONS = {
    // building id 7 corresponds to CTECH Building in BuildingsContext initial data
    7: {
      // approximate rectangles given as polygon points (x,y) normalized to image size
      "IT RM 1": [
        { x: 0.05, y: 0.12 },
        { x: 0.34, y: 0.12 },
        { x: 0.34, y: 0.48 },
        { x: 0.05, y: 0.48 },
      ],
      "Faculty Office": [
        { x: 0.36, y: 0.12 },
        { x: 0.63, y: 0.12 },
        { x: 0.63, y: 0.48 },
        { x: 0.36, y: 0.48 },
      ],
      "Lab B": [
        { x: 0.18, y: 0.5 },
        { x: 0.35, y: 0.5 },
        { x: 0.35, y: 0.7 },
        { x: 0.18, y: 0.7 },
      ],
      "Lab C": [
        { x: 0.38, y: 0.5 },
        { x: 0.55, y: 0.5 },
        { x: 0.55, y: 0.7 },
        { x: 0.38, y: 0.7 },
      ],
      Multimedia: [
        { x: 0.70, y: 0.18 },
        { x: 0.95, y: 0.18 },
        { x: 0.95, y: 0.7 },
        { x: 0.70, y: 0.7 },
      ],
      "Dean's Office": [
        { x: 0.02, y: 0.72 },
        { x: 0.18, y: 0.72 },
        { x: 0.18, y: 0.9 },
        { x: 0.02, y: 0.9 },
      ],
      CR: [
        { x: 0.86, y: 0.02 },
        { x: 0.98, y: 0.02 },
        { x: 0.98, y: 0.14 },
        { x: 0.86, y: 0.14 },
      ],
    },
  };

  // route + animation
  const [routeStops, setRouteStops] = useState([]);
  const [routePoints, setRoutePoints] = useState([]);
  const [directionsList, setDirectionsList] = useState([]);
  const animProgress = useRef(new Animated.Value(0)).current;
  const [walkerPos, setWalkerPos] = useState(null);
  const animRef = useRef(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const youPulse = useRef(new Animated.Value(0)).current;
  const [youPos, setYouPos] = useState(null); // optional 'You' marker (map coords)
  const legendOpacity = useRef(new Animated.Value(0)).current;
  // marker visibility filters and favorites
  const [visibility, setVisibility] = useState({ building: true, court: true, gate: true, tree: true, poi: true });
  const [favorites, setFavorites] = useState(new Set());
  const [loggedUser, setLoggedUser] = useState(null);

  // start pulsing animation when walker is present
  useEffect(() => {
    if (!walkerPos) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [walkerPos]);

  // pulse for 'You' marker (if present)
  useEffect(() => {
    if (!youPos) return;
    youPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(youPulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(youPulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [youPos]);


  // fade legend in when the map layout becomes available
  useEffect(() => {
    if (mapLayout) {
      Animated.timing(legendOpacity, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    } else {
      Animated.timing(legendOpacity, { toValue: 0, duration: 240, useNativeDriver: true }).start();
    }
  }, [mapLayout]);

  // load visibility & favorites from storage
  useEffect(() => {
    (async () => {
      try {
        const vs = await AsyncStorage.getItem('markerVisibility');
        if (vs) {
          const parsed = JSON.parse(vs);
          setVisibility((s) => ({ ...s, ...parsed }));
        }
        // load logged user (if any) so favorites are stored per-user
        const lu = await AsyncStorage.getItem('loggedUser');
        const parsedUser = lu ? JSON.parse(lu) : null;
        if (parsedUser) setLoggedUser(parsedUser);

        const favKeyFor = (user) => {
          if (!user) return 'favoriteMarkers_visitor';
          return `favoriteMarkers_${(user.idNumber || user.email || user.id || 'user')}`;
        };

        // try per-user favorites first, fall back to legacy global key if needed
        const favKey = favKeyFor(parsedUser);
        let fav = await AsyncStorage.getItem(favKey);
        if (!fav) {
          // fallback to legacy global favorites for older installs
          const legacy = await AsyncStorage.getItem('favoriteMarkers');
          if (legacy) fav = legacy;
        }
        if (fav) {
          const arr = JSON.parse(fav || '[]');
          setFavorites(new Set(Array.isArray(arr) ? arr : []));
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const saveVisibility = async (next) => {
    try { await AsyncStorage.setItem('markerVisibility', JSON.stringify(next)); } catch (e) {}
  };
  const saveFavorites = async (setVal, userParam) => {
    try {
      const user = userParam || loggedUser;
      const key = user ? `favoriteMarkers_${(user.idNumber || user.email || user.id || 'user')}` : 'favoriteMarkers_visitor';
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(setVal)));
    } catch (e) {}
  };

  const toggleKind = (kind) => {
    const next = { ...visibility, [kind]: !visibility[kind] };
    setVisibility(next);
    saveVisibility(next);
    setSpiderfy(null);
  };

  const toggleFavorite = async (id) => {
    try {
      let user = loggedUser;
      if (!user) {
        const lu = await AsyncStorage.getItem('loggedUser');
        user = lu ? JSON.parse(lu) : null;
      }
      if (!user) {
        Alert.alert('Login required', 'Please log in to favorite buildings.');
        return;
      }

      const s = new Set(favorites);
      if (s.has(id)) s.delete(id); else s.add(id);
      setFavorites(new Set(s));
      await saveFavorites(s, user);
    } catch (e) {
      // ignore save errors
    }
  };

  // load buildings/gates from AsyncStorage on mount (backcompat)
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem("campusBuildings");
        if (stored) {
          const parsed = JSON.parse(stored).map((b) => ({
            ...b,
            kind: b.kind || "building",
            x: Number(b.x) || 0,
            y: Number(b.y) || 0,
            stepsFromMainGate: Number(b.stepsFromMainGate) || 0,
            rooms: Array.isArray(b.rooms) ? b.rooms : typeof b.rooms === "string" ? b.rooms.split(",").map((r) => r.trim()) : [],
            isMainGate: b.isMainGate === true || b.isMainGate === "true" || (b.kind === "gate" && !!b.isMainGate),
            color: b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general,
            gateIcon: b.gateIcon || null,
            floorPlan: b.floorPlan || null,
          }));
          setLocalBuildings(parsed);
        } else {
          const safe = (buildings || []).map((b) => ({
            ...b,
            kind: b.kind || "building",
            x: Number(b.x) || 0,
            y: Number(b.y) || 0,
            stepsFromMainGate: Number(b.stepsFromMainGate) || 0,
            rooms: Array.isArray(b.rooms) ? b.rooms : [],
            isMainGate: b.isMainGate === true,
            color: b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general,
            gateIcon: b.gateIcon || null,
            floorPlan: b.floorPlan || null,
          }));
          setLocalBuildings(safe);
        }
      } catch (e) {
        const safe = (buildings || []).map((b) => ({
          ...b,
          kind: b.kind || "building",
          x: Number(b.x) || 0,
          y: Number(b.y) || 0,
          stepsFromMainGate: Number(b.stepsFromMainGate) || 0,
          rooms: Array.isArray(b.rooms) ? b.rooms : [],
          isMainGate: b.isMainGate === true,
          color: b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general,
          gateIcon: b.gateIcon || null,
          floorPlan: b.floorPlan || null,
        }));
        setLocalBuildings(safe);
      }
    };
    load();
    // run only on mount; context updates are handled by a separate effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep localBuildings in sync immediately when context `buildings` changes
  useEffect(() => {
    if (!buildings) return;
    // track previous buildings so we can detect newly added items
    if (!globalThis.__prevBuildingsRef) globalThis.__prevBuildingsRef = new Set();
    const normalized = (buildings || []).map((b) => ({
      ...b,
      kind: b.kind || "building",
      x: Number(b.x) || 0,
      y: Number(b.y) || 0,
      stepsFromMainGate: Number(b.stepsFromMainGate) || 0,
      rooms: Array.isArray(b.rooms) ? b.rooms : typeof b.rooms === "string" ? b.rooms.split(",").map((r) => r.trim()) : [],
      isMainGate: b.isMainGate === true,
      color: b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general,
      gateIcon: b.gateIcon || null,
      floorPlan: b.floorPlan || null,
    }));
    console.log('[VisitorMap] buildings context updated, count=', normalized.length, 'sample=', normalized.slice(-3));
    // detect newly added building (by id) and center on it so admin additions are visible
    try {
      const prevSet = globalThis.__prevBuildingsRef || new Set();
      const added = normalized.find((nb) => nb && nb.id && !prevSet.has(nb.id));
      setLocalBuildings(normalized);
      // update prev set
      globalThis.__prevBuildingsRef = new Set((normalized || []).map((x) => x && x.id));
      if (added) {
        // small delay so layout settles before centering
        setTimeout(() => {
          try { centerOnBuilding(added); } catch (e) { console.warn('centerOnBuilding failed', e); }
        }, 220);
      }
    } catch (e) {
      setLocalBuildings(normalized);
    }
  }, [buildings]);

  const filtered = localBuildings.filter((b) => {
    const q = (b.name || "").toLowerCase();
    const matches = q.includes((search || "").toLowerCase());
    const kind = b.kind || 'building';
    const visible = !!visibility[kind];
    return matches && visible;
  });
  const calculateWalkingTime = (steps) => Math.ceil((Number(steps) || 0) / 80);
  // Use the building's raw coordinates as its logical center for routing/positioning.
  const getCenter = (b) => ({ x: (Number(b.x) || 0), y: (Number(b.y) || 0) });
  const findPrimaryGate = () => localBuildings.find((b) => b.kind === "gate" && b.isMainGate) || localBuildings.find((b) => b.kind === "gate");

  

  const handleSearchSubmit = (text) => {
    const q = (text || search || "").toLowerCase().trim();
    if (!q) return;
    const match = localBuildings.find((b) => (b.name || "").toLowerCase().includes(q));
    if (match) {
      // center on the matched item. For non-tree items, also open details.
      centerOnBuilding(match);
      if (match.kind !== "tree") {
        setSelectedBuilding(match);
        setFloorPlanModalVisible(true);
      }
      return;
    }
    Alert.alert("Not found", "No campus item matches your search");
  };

  // Long-press helpers for SVG elements (courts) — use timers because react-native-svg
  // doesn't provide a built-in long-press handler reliably across platforms.
  const longPressTimerRef = useRef({});
  const longPressFiredRef = useRef(null);

  const startLongPress = (b) => {
    const id = b.id;
    if (longPressTimerRef.current[id]) clearTimeout(longPressTimerRef.current[id]);
    longPressTimerRef.current[id] = setTimeout(() => {
      longPressFiredRef.current = id;
      setSelectedBuilding(b);
      setFloorPlanModalVisible(true);
      delete longPressTimerRef.current[id];
    }, 520);
  };

  const endLongPress = (b) => {
    const id = b.id;
    const t = longPressTimerRef.current[id];
    if (t) { clearTimeout(t); delete longPressTimerRef.current[id]; }
    // clear fired flag shortly after so onPress can be suppressed
    setTimeout(() => { if (longPressFiredRef.current === id) longPressFiredRef.current = null; }, 50);
  };

  // L-shape + custom
  const getLShapePath = (start, end, direction = "right") => {
    let midX = direction === "right" ? end.x : start.x;
    return [{ x: start.x, y: start.y }, { x: midX, y: start.y }, { x: midX, y: end.y }, { x: end.x, y: end.y }];
  };
  const customRoutes = { "Entrance Gate → CTECH Building": "STRAIGHT_THEN_RIGHT", "Entrance Gate → Admin Building": "STRAIGHT_THEN_RIGHT" };
  // Build a sampled road network from the map's road polylines so route routing
  // can follow roads. This creates `roadNetwork.nodes` and `roadNetwork.adj`.
  const roadNetwork = React.useMemo(() => {
    // helper distance
    const dist = (a, b) => {
      const dx = a.x - b.x; const dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy);
    };

    // Define road centerlines roughly matching the rendered roads above
    const xL = MAP_WIDTH * 0.155;
    const xR = MAP_WIDTH * 0.780;
    const topY = MAP_HEIGHT * 0.08;
    const bottomY = MAP_HEIGHT * 0.92;
    const midY = MAP_HEIGHT * 0.52;
    const y76 = MAP_HEIGHT * 0.76;
    const y18 = MAP_HEIGHT * 0.18;

    const polylines = [
      // left vertical
      [{ x: xL, y: topY }, { x: xL, y: bottomY }],
      // right vertical
      [{ x: xR, y: topY }, { x: xR, y: bottomY }],
      // center horizontal
      [{ x: xL, y: midY }, { x: xR, y: midY }],
      // lower horizontal
      [{ x: xL, y: y76 }, { x: xR, y: y76 }],
      // upper-right horizontal (short)
      [{ x: MAP_WIDTH * 0.580, y: y18 }, { x: xR, y: y18 }],
    ];

    // sample polylines into nodes
    const step = 20; // sample spacing in px
    const nodes = [];
    const nodeKey = (p) => `${Math.round(p.x)}|${Math.round(p.y)}`;
    const keyIndex = {};

    const addNode = (p) => {
      const k = nodeKey(p);
      if (k in keyIndex) return keyIndex[k];
      const id = nodes.length; nodes.push({ x: p.x, y: p.y }); keyIndex[k] = id; return id;
    };

    const adj = {};
    const connect = (i, j) => {
      if (!adj[i]) adj[i] = [];
      if (!adj[j]) adj[j] = [];
      const w = dist(nodes[i], nodes[j]);
      adj[i].push({ to: j, w });
      adj[j].push({ to: i, w });
    };

    for (let pl of polylines) {
      for (let s = 0; s < pl.length - 1; s++) {
        const a = pl[s]; const b = pl[s + 1];
        const dx = b.x - a.x; const dy = b.y - a.y; const segLen = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.ceil(segLen / step));
        let prevIndex = null;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const p = { x: a.x + dx * t, y: a.y + dy * t };
          const idx = addNode(p);
          if (prevIndex !== null && prevIndex !== idx) connect(prevIndex, idx);
          prevIndex = idx;
        }
      }
    }

    // connect nearby junction nodes (within threshold) to form intersections
    const junctionThresh = step * 1.25;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (dist(nodes[i], nodes[j]) <= junctionThresh) {
          // ensure connected
          connect(i, j);
        }
      }
    }

    return { nodes, adj };
  }, [MAP_WIDTH, MAP_HEIGHT]);

  // Dijkstra on the small sampled road graph
  const shortestPathDijkstra = (network, startIdx, endIdx) => {
    if (!network || !network.nodes || !network.adj) return null;
    const n = network.nodes.length;
    const distArr = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(null);
    const visited = new Array(n).fill(false);
    distArr[startIdx] = 0;
    for (let iter = 0; iter < n; iter++) {
      let u = -1; let best = Infinity;
      for (let i = 0; i < n; i++) if (!visited[i] && distArr[i] < best) { best = distArr[i]; u = i; }
      if (u === -1) break;
      if (u === endIdx) break;
      visited[u] = true;
      const edges = network.adj[u] || [];
      for (let e of edges) {
        const v = e.to; const w = e.w;
        if (distArr[u] + w < distArr[v]) { distArr[v] = distArr[u] + w; prev[v] = u; }
      }
    }
    if (distArr[endIdx] === Infinity) return null;
    const path = [];
    let cur = endIdx;
    while (cur !== null) { path.push(cur); cur = prev[cur]; }
    path.reverse();
    return path;
  };
  const getRoutePointsForPair = (startB, endB) => {
    const start = getCenter(startB);
    const end = getCenter(endB);

    // Use road-network routing where possible: snap start/end to nearest road
    try {
      if (roadNetwork && roadNetwork.nodes && roadNetwork.adj) {
        const snapToRoad = (pt) => {
          // find nearest node index
          let best = 0; let bestD = Infinity;
          for (let i = 0; i < roadNetwork.nodes.length; i++) {
            const n = roadNetwork.nodes[i];
            const dx = n.x - pt.x; const dy = n.y - pt.y; const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = i; }
          }
          return best;
        };

        const si = snapToRoad(start);
        const ei = snapToRoad(end);

        // Shortest path on the sampled road graph
        const pathIdx = shortestPathDijkstra(roadNetwork, si, ei);
        if (pathIdx && pathIdx.length >= 2) {
          // Build points: start -> snapped node -> ... -> snapped node -> end
          const pts = [start];
          for (let idx of pathIdx) pts.push({ x: roadNetwork.nodes[idx].x, y: roadNetwork.nodes[idx].y });
          pts.push(end);
          return pts;
        }
      }
    } catch (e) {
      // fallback to direct
    }

    const key = `${startB.name} → ${endB.name}`;
    const rule = customRoutes[key];
    if (rule === "STRAIGHT_THEN_RIGHT") return getLShapePath(start, end, "right");
    return [start, end];
  };
  const buildFullRoutePoints = (stopsArr) => {
    if (!stopsArr || stopsArr.length < 2) return [];
    const pts = [];
    for (let i = 0; i < stopsArr.length - 1; i++) {
      const pairPts = getRoutePointsForPair(stopsArr[i], stopsArr[i + 1]);
      if (i === 0) pts.push(...pairPts);
      else pts.push(...pairPts.slice(1));
    }
    return pts;
  };
  const polylinePointsString = (pts) => pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
  const buildSegmentInfo = (pts) => {
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      segs.push({ a, b, len }); total += len;
    }
    return { segs, total };
  };
  const getPointAt = (pts, t) => {
    if (!pts || pts.length === 0) return null;
    const { segs, total } = buildSegmentInfo(pts);
    if (total === 0) return pts[0];
    let target = t * total;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (target <= s.len) {
        const ratio = s.len === 0 ? 0 : target / s.len;
        const x = s.a.x + (s.b.x - s.a.x) * ratio;
        const y = s.a.y + (s.b.y - s.a.y) * ratio;
        return { x, y };
      }
      target -= s.len;
    }
    return pts[pts.length - 1];
  };

  // Fit all buildings into view (minimize / show all)
  const fitAll = () => {
    if (!mapLayout || !localBuildings || localBuildings.length === 0) {
      // fallback: reset
      Animated.parallel([Animated.spring(scale, { toValue: 1, useNativeDriver: true }), Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true })]).start(() => {
        lastPan.current = { x: 0, y: 0 };
      });
      return;
    }

    const centers = localBuildings.map(getCenter);
    const minX = Math.min(...centers.map((c) => c.x));
    const maxX = Math.max(...centers.map((c) => c.x));
    const minY = Math.min(...centers.map((c) => c.y));
    const maxY = Math.max(...centers.map((c) => c.y));

    const padding = 80;
    const contentW = Math.max(1, maxX - minX + padding * 2);
    const contentH = Math.max(1, maxY - minY + padding * 2);

    const mapVisibleW = mapLayout.width || SCREEN_WIDTH - 40; // approximate if missing
    const mapVisibleH = mapLayout.height || 330;

    // desired scale to fit content inside visible map container
    const desiredScale = Math.min(3, Math.max(0.8, Math.min(mapVisibleW / contentW, mapVisibleH / contentH)));
    const centerX = minX + (contentW - padding * 2) / 2;
    const centerY = minY + (contentH - padding * 2) / 2;

    const screenCenterX = mapLayout.x + mapVisibleW / 2;
    const screenCenterY = mapLayout.y + mapVisibleH / 2;

    const toX = screenCenterX - centerX * desiredScale;
    const toY = screenCenterY - centerY * desiredScale;

    const minXClamp = SCREEN_WIDTH - MAP_WIDTH * desiredScale;
    const maxXClamp = 0;
    const minYClamp = Math.min(SCREEN_HEIGHT - MAP_HEIGHT * desiredScale, 0);
    const maxYClamp = 0;

    const clampedX = Math.min(Math.max(toX, minXClamp), maxXClamp);
    const clampedY = Math.min(Math.max(toY, minYClamp), maxYClamp);

    Animated.parallel([
      Animated.timing(scale, { toValue: desiredScale, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pan, { toValue: { x: clampedX, y: clampedY }, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      lastPan.current = { x: clampedX, y: clampedY };
      scaleValueRef.current = desiredScale;
    });
  };

  // PanResponder (keeps ScrollView disabled while interacting)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // don't capture simple taps so child SVG onPress handlers run;
        // only start responding once movement indicates a drag (handled in onMoveShouldSetPanResponder)
        return false;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // only start pan responder for single-finger drags; two-finger pinch is handled
        // by the PinchGestureHandler to avoid conflicts
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 1) return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
        return false;
      },
      onPanResponderGrant: (evt) => {
        setScrollEnabled(false);
        pan.setOffset(lastPan.current);
        pan.setValue({ x: 0, y: 0 });
        initialDistanceRef.current = null;
        pinchCenterRef.current = null;
        gestureStartRef.current = Date.now();
        const touches = evt.nativeEvent.touches || [];
        // ignore multi-touch here — pinch is handled by PinchGestureHandler
        if (touches.length > 1) return;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 1) {
          // dragging - relative
          pan.x.setValue(gestureState.dx);
          pan.y.setValue(gestureState.dy);
        } else {
          // For multi-touch we delegate pinch/zoom to the PinchGestureHandler above.
          return;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        setScrollEnabled(true);

        // Detect a quick tap (small movement + short duration) and open building modal
        try {
          const moved = Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;
          const short = Date.now() - (gestureStartRef.current || 0) < 300;
          if (moved && short && !pinchActiveRef.current && !pinchRecentlyRef.current && mapLayout) {
            const ne = evt && evt.nativeEvent ? evt.nativeEvent : {};
            // derive page coords (fallbacks for different platforms)
            const pageX = ne.pageX || (ne.touches && ne.touches[0] && ne.touches[0].pageX) || ne.locationX || 0;
            const pageY = ne.pageY || (ne.touches && ne.touches[0] && ne.touches[0].pageY) || ne.locationY || 0;

            const mapX = (pageX - (mapLayout.x || 0) - getPanX()) / (scaleValueRef.current || 1);
            const mapY = (pageY - (mapLayout.y || 0) - getPanY()) / (scaleValueRef.current || 1);

            // find nearest building within a reasonable threshold
            let nearest = null; let best = Infinity;
            for (let i = 0; i < (localBuildings || []).length; i++) {
              const b = localBuildings[i];
              if (!b) continue;
              const bx = Number(b.x) || 0; const by = Number(b.y) || 0;
              const d = Math.hypot(mapX - bx, mapY - by);
              if (d < best) { best = d; nearest = b; }
            }
            if (nearest && best < 32) {
              setSelectedBuilding(nearest);
              // ensure we open the details modal (not the floorplan modal)
              setFloorPlanModalVisible(false);
              // short-circuit momentum handling — we've consumed this as a tap
              lastPan.current = { x: (typeof pan.x.__getValue === 'function' ? pan.x.__getValue() : pan.x._value) + (pan.x._offset || 0), y: (typeof pan.y.__getValue === 'function' ? pan.y.__getValue() : pan.y._value) + (pan.y._offset || 0) };
              return;
            }
          }
        } catch (e) {
          // swallow — fall through to normal release behavior
        }

        // capture velocities for momentum
        const vx = gestureState.vx || 0;
        const vy = gestureState.vy || 0;

        // flatten offsets and compute current positions
        const curX = (typeof pan.x.__getValue === "function" ? pan.x.__getValue() : pan.x._value) + (pan.x._offset || 0);
        const curY = (typeof pan.y.__getValue === "function" ? pan.y.__getValue() : pan.y._value) + (pan.y._offset || 0);

        pan.flattenOffset();
        initialDistanceRef.current = null;
        pinchCenterRef.current = null;

        // target clamping based on current scale
        const s = scaleValueRef.current;
        const maxX = 0;
        const minX = SCREEN_WIDTH - MAP_WIDTH * s;
        const minY = 0 - (MAP_HEIGHT * s - (mapLayout ? mapLayout.height : 330));
        const maxY = 0;

        // Start decay (momentum) then clamp to bounds
        const decel = 0.997;
        const decayX = Animated.decay(pan.x, { velocity: vx, deceleration: decel, useNativeDriver: true });
        const decayY = Animated.decay(pan.y, { velocity: vy, deceleration: decel, useNativeDriver: true });

        Animated.parallel([decayX, decayY]).start(() => {
          // after decay finished, decide whether to clamp to bounds
          const finalX = (typeof pan.x.__getValue === "function" ? pan.x.__getValue() : pan.x._value);
          const finalY = (typeof pan.y.__getValue === "function" ? pan.y.__getValue() : pan.y._value);

          // if free-pan mode or a pinch just occurred, allow free positioning (don't force clamp)
          if (FREE_PAN || pinchRecentlyRef.current) {
            lastPan.current = { x: finalX, y: finalY };
            return;
          }

          const clampedX = Math.min(Math.max(finalX, minX), maxX);
          const clampedY = Math.min(Math.max(finalY, minY), maxY);

          Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, stiffness: 180, damping: 20, useNativeDriver: true }).start(() => {
            lastPan.current = { x: clampedX, y: clampedY };
          });
        });
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // campus paths for visuals
  const renderCampusPaths = () => {
    const cx = MAP_WIDTH / 2;
    const cy = MAP_HEIGHT / 2 + 20;
    const arc = (r) => `M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`;
    return (
      <>
        <Path d={arc(120)} stroke="#e6f0ea" strokeWidth={22} strokeLinecap="round" fill="none" />
        <Path d={arc(80)} stroke="#eaf7ee" strokeWidth={14} strokeLinecap="round" fill="none" />
        <Path d={arc(30)} stroke="#f6fff6" strokeWidth={8} strokeLinecap="round" fill="none" />
        <Path d={`M ${cx},${cy - 160} L ${cx},${cy + 160}`} stroke="#f0f6f0" strokeWidth={10} strokeLinecap="round" fill="none" />
        <Path d={`M ${cx - 160},${cy} L ${cx + 160},${cy}`} stroke="#f0f6f0" strokeWidth={10} strokeLinecap="round" fill="none" />
      </>
    );
  };

  // Iso campus paths: approximate the same arcs/lines but mapped through worldToIso
  const renderCampusPathsIso = () => {
    // sample an arc and map points through worldToIso
    const cx = MAP_WIDTH / 2;
    const cy = MAP_HEIGHT / 2 + 20;

    const sampleArcPoints = (r, steps = 48) => {
      const pts = [];
      const start = Math.PI; // left
      const end = 0; // right
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = start + (end - start) * t;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const iso = worldToIso(x, y);
        pts.push(`${iso.x},${iso.y}`);
      }
      return pts.join(' ');
    };

    const sampleLinePoints = (ax, ay, bx, by, steps = 6) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t;
        const iso = worldToIso(x, y);
        pts.push(`${iso.x},${iso.y}`);
      }
      return pts.join(' ');
    };

    return (
      <>
        <Polyline points={sampleArcPoints(120)} fill="none" stroke="#e6f0ea" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points={sampleArcPoints(80)} fill="none" stroke="#eaf7ee" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points={sampleArcPoints(30)} fill="none" stroke="#f6fff6" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />

        <Polyline points={sampleLinePoints(cx, cy - 160, cx, cy + 160)} stroke="#f0f6f0" strokeWidth={10} strokeLinecap="round" />
        <Polyline points={sampleLinePoints(cx - 160, cy, cx + 160, cy)} stroke="#f0f6f0" strokeWidth={10} strokeLinecap="round" />
      </>
    );
  };

  // Render the custom rectangular roads in isometric projection
  const renderCustomRoadsIso = () => {
    const specs = [];
    // left vertical
    specs.push({ x: MAP_WIDTH * 0.155 - MAP_WIDTH * 0.022, y: MAP_HEIGHT * 0.08, w: MAP_WIDTH * 0.044, h: MAP_HEIGHT * 0.84 });
    // right vertical
    specs.push({ x: MAP_WIDTH * 0.780 - MAP_WIDTH * 0.022, y: MAP_HEIGHT * 0.08, w: MAP_WIDTH * 0.044, h: MAP_HEIGHT * 0.84 });
    // center horizontal
    specs.push({ x: MAP_WIDTH * 0.155 - MAP_WIDTH * 0.002, y: MAP_HEIGHT * 0.52 - MAP_HEIGHT * 0.04, w: (MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.155), h: MAP_HEIGHT * 0.08 });
    // lower horizontal
    specs.push({ x: MAP_WIDTH * 0.155 - MAP_WIDTH * 0.002, y: MAP_HEIGHT * 0.76 - MAP_HEIGHT * 0.04, w: (MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.155), h: MAP_HEIGHT * 0.08 });
    // upper-right horizontal
    specs.push({ x: MAP_WIDTH * 0.580 - MAP_WIDTH * 0.002, y: MAP_HEIGHT * 0.18 - MAP_HEIGHT * 0.04, w: (MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.580), h: MAP_HEIGHT * 0.08 });

    const lines = [];
    lines.push({ ax: MAP_WIDTH * 0.155, ay: MAP_HEIGHT * 0.08, bx: MAP_WIDTH * 0.155, by: MAP_HEIGHT * 0.92 });
    lines.push({ ax: MAP_WIDTH * 0.780, ay: MAP_HEIGHT * 0.08, bx: MAP_WIDTH * 0.780, by: MAP_HEIGHT * 0.92 });
    lines.push({ ax: MAP_WIDTH * 0.155, ay: MAP_HEIGHT * 0.52, bx: MAP_WIDTH * 0.780, by: MAP_HEIGHT * 0.52 });
    lines.push({ ax: MAP_WIDTH * 0.155, ay: MAP_HEIGHT * 0.76, bx: MAP_WIDTH * 0.780, by: MAP_HEIGHT * 0.76 });
    lines.push({ ax: MAP_WIDTH * 0.580, ay: MAP_HEIGHT * 0.18, bx: MAP_WIDTH * 0.780, by: MAP_HEIGHT * 0.18 });

    return (
      <G id="custom-roads-iso">
        {specs.map((s, i) => {
          const tl = worldToIso(s.x, s.y);
          const tr = worldToIso(s.x + s.w, s.y);
          const br = worldToIso(s.x + s.w, s.y + s.h);
          const bl = worldToIso(s.x, s.y + s.h);
          const pts = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
          return <Polygon key={`road-${i}`} points={pts} fill="#555" />;
        })}

        {lines.map((L, i) => {
          const a = worldToIso(L.ax, L.ay);
          const b = worldToIso(L.bx, L.by);
          return <Polyline key={`rline-${i}`} points={`${a.x},${a.y} ${b.x},${b.y}`} stroke="#dcdcdc" strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />;
        })}
      </G>
    );
  };

  // Courts are intentionally not pre-rendered — admin users add courts/trees via Admin UI

  // Gate rendering (prefers gateIcon image)
  const renderGate = (g) => {
    const left = Number(g.x) || 0;
    const topPos = Number(g.y) || 0;
    const label = g.name || "Gate";
    const W = 56, H = 56;
    return (
      <TouchableOpacity
        key={`gate-${g.id}`}
        activeOpacity={0.95}
        onPress={() => setSelectedBuilding(g)}
        style={[styles.gateTouch, { left: left - 6, top: topPos - 12 }]}
      >
        {g.gateIcon ? (
          <Image source={{ uri: g.gateIcon }} style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 0 }} />
        ) : (
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <G>
              <Path d={`M ${W * 0.1},${H * 0.9} L ${W * 0.1},${H * 0.45} A ${W * 0.4},${H * 0.45} 0 1,1 ${W * 0.9},${H * 0.45} L ${W * 0.9},${H * 0.9} Z`} fill={"#2a7dff"} stroke={darken("#2a7dff", 0.18)} strokeWidth={1} />
              <Path d={`M ${W * 0.3},${H * 0.9} L ${W * 0.3},${H * 0.55} A ${W * 0.2},${H * 0.28} 0 1,1 ${W * 0.7},${H * 0.55} L ${W * 0.7},${H * 0.9} Z`} fill={"#fff"} />
            </G>
          </Svg>
        )}
        <View style={styles.gateLabel}><Text numberOfLines={1} style={styles.gateLabelText}>{label}</Text></View>
      </TouchableOpacity>
    );
  };

  // Prototype: isometric block renderer (SVG). This is a simple approximation
  // that converts map world (x,y) into an isometric screen position and draws
  // a roof + left/right faces. It's intended as a visual prototype; tweak
  // TILE sizes to match your desired perspective.
  const TILE_W = 36;
  const TILE_H = 18;
  const FLOOR_H = 6;

  const worldToIso = (wx, wy) => {
    // Origin offset so the iso map sits nicely inside the SVG viewport
    const originX = MAP_WIDTH * 0.25;
    const originY = MAP_HEIGHT * 0.18;
    const sx = originX + (wx - wy) * (TILE_W * 0.5);
    const sy = originY + (wx + wy) * (TILE_H * 0.5);
    return { x: sx, y: sy };
  };

  const renderIsoBlock = (b) => {
    const baseColor = b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general;
    const floors = Math.max(1, Number(b?.floors) || Math.ceil((b?.rooms?.length || 0) / 3));
    const iso = worldToIso(Number(b.x) || 0, Number(b.y) || 0);

    const roofCenter = { x: iso.x, y: iso.y - floors * FLOOR_H };
    const halfW = TILE_W / 2;
    const halfH = TILE_H / 2;

    const pTop = { x: roofCenter.x, y: roofCenter.y - halfH };
    const pRight = { x: roofCenter.x + halfW, y: roofCenter.y };
    const pBottom = { x: roofCenter.x, y: roofCenter.y + halfH };
    const pLeft = { x: roofCenter.x - halfW, y: roofCenter.y };

    // ground points (drop by floor height)
    const drop = floors * FLOOR_H;
    const gLeft = { x: pLeft.x, y: pLeft.y + drop };
    const gRight = { x: pRight.x, y: pRight.y + drop };
    const gBottom = { x: pBottom.x, y: pBottom.y + drop };

    const roofPoints = `${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`;
    const leftFace = `${pLeft.x},${pLeft.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gLeft.x},${gLeft.y}`;
    const rightFace = `${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gRight.x},${gRight.y}`;

    const roofColor = lighten(baseColor, 0.04);
    const leftColor = darken(baseColor, 0.12);
    const rightColor = darken(baseColor, 0.06);

    // compute a small wrapper style so touches align; position it centered at iso.x, iso.y
    const wrapperStyle = { position: "absolute", left: iso.x - TILE_W, top: iso.y - TILE_H - floors * FLOOR_H, width: TILE_W * 2, height: TILE_H * 2 + floors * FLOOR_H };

    return (
      <View key={`iso-${b.id}`} style={wrapperStyle} pointerEvents="box-none">
        <Svg width={wrapperStyle.width} height={wrapperStyle.height} viewBox={`${iso.x - TILE_W} ${iso.y - TILE_H - floors * FLOOR_H} ${wrapperStyle.width} ${wrapperStyle.height}`}>
          <G>
            {/* soft shadow */}
            <Ellipse cx={iso.x} cy={iso.y + 6} rx={TILE_W * 0.8} ry={TILE_H * 0.5} fill="rgba(0,0,0,0.12)" />
            {/* left face */}
            <Polygon points={leftFace} fill={leftColor} stroke={darken(leftColor, 0.06)} strokeWidth={0.5} />
            {/* right face */}
            <Polygon points={rightFace} fill={rightColor} stroke={darken(rightColor, 0.04)} strokeWidth={0.5} />
            {/* roof */}
            <Polygon points={roofPoints} fill={roofColor} stroke={darken(roofColor, 0.08)} strokeWidth={0.6} />
          </G>
        </Svg>

        {/* Name bubble positioned above roof */}
        <View style={[styles.nameBubble, { position: "absolute", left: wrapperStyle.width / 2 - 28, top: 6, backgroundColor: "rgba(0,0,0,0.6)" }]}>
          <Text numberOfLines={1} style={[styles.nameBubbleText, { color: "#fff", fontSize: 12 }]}>{(b.name || "").length > 14 ? (b.name || "").slice(0, 13) + "…" : (b.name || "")}</Text>
        </View>
      </View>
    );
  };

  // diorama mode removed; keep cycleMode as noop for compatibility
  const cycleMode = () => {};

  // handle routePoints when routeStops change
  useEffect(() => {
    const pts = buildFullRoutePoints(routeStops);
    setRoutePoints(pts);
    animProgress.setValue(0);
    setWalkerPos(pts.length > 0 ? pts[0] : null);
    // compute concise turn-by-turn directions from the sampled route points
    try {
      const computeDirections = (ptsArr) => {
        if (!ptsArr || ptsArr.length < 2) return [];
        const { segs } = buildSegmentInfo(ptsArr);
        if (!segs || segs.length === 0) return [];

        const isTurn = (prev, cur) => {
          const v1x = prev.b.x - prev.a.x; const v1y = prev.b.y - prev.a.y;
          const v2x = cur.b.x - cur.a.x; const v2y = cur.b.y - cur.a.y;
          const mag1 = Math.hypot(v1x, v1y) || 1;
          const mag2 = Math.hypot(v2x, v2y) || 1;
          const dot = v1x * v2x + v1y * v2y;
          const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
          const ang = Math.acos(cos) * (180 / Math.PI);
          const cross = v1x * v2y - v1y * v2x;
          if (ang > 35) return cross < 0 ? 'right' : 'left';
          return 'straight';
        };

        const out = [];
        let i = 0;
        // head: accumulate initial straight run
        while (i < segs.length) {
          if (i === 0) {
            // accumulate straight distance from start until first turn
            let sum = segs[0].len;
            let j = 1;
            while (j < segs.length && isTurn(segs[j - 1], segs[j]) === 'straight') {
              sum += segs[j].len; j++;
            }
            out.push(`Head straight for ${Math.round(sum)} m`);
            i = j;
            continue;
          }

          // determine if this segment is a turn relative to previous
          const typ = isTurn(segs[i - 1], segs[i]);
          if (typ === 'straight') {
            // accumulate consecutive straight segments
            let sum = segs[i].len; let j = i + 1;
            while (j < segs.length && isTurn(segs[j - 1], segs[j]) === 'straight') {
              sum += segs[j].len; j++;
            }
            out.push(`Continue straight for ${Math.round(sum)} m`);
            i = j;
          } else {
            // a turn: emit a turn instruction, then continue
            out.push(`Turn ${typ}`);
            i = i + 1;
          }
        }

        return out;
      };

      const dirs = computeDirections(pts);
      setDirectionsList(dirs);
    } catch (e) {
      setDirectionsList([]);
    }
  }, [routeStops]);

  const startRouteAnimation = (duration = 4000) => {
    if (!routePoints || routePoints.length < 2) return;
    animProgress.setValue(0);
    if (animRef.current) animRef.current.stop();
    animRef.current = Animated.timing(animProgress, { toValue: 1, duration, useNativeDriver: false });
    const id = animProgress.addListener(({ value }) => {
      const p = getPointAt(routePoints, value);
      if (p) setWalkerPos(p);
    });
    animRef.current.start(() => {
      animProgress.removeListener(id);
    });
  };

  const clearRoute = () => { setRouteStops([]); setRoutePoints([]); animProgress.setValue(0); setWalkerPos(null); };

  const centerOnBuilding = (b) => {
    const s = scaleValueRef.current;
    const target = { x: (Number(b.x) || 0), y: (Number(b.y) || 0) };
    const screenCenterX = SCREEN_WIDTH / 2;
    const screenCenterY = (mapLayout ? mapLayout.y : 165) + (mapLayout ? mapLayout.height / 2 : 165);
    const toX = screenCenterX - target.x * s;
    const toY = screenCenterY - target.y * s;
    const minX = SCREEN_WIDTH - MAP_WIDTH * s; const maxX = 0;
    const minY = Math.min(SCREEN_HEIGHT - MAP_HEIGHT * s, 0); const maxY = 0;
    const clampedX = Math.min(Math.max(toX, minX), maxX); const clampedY = Math.min(Math.max(toY, minY), maxY);
    Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, stiffness: 180, damping: 20, useNativeDriver: true }).start(() => lastPan.current = { x: clampedX, y: clampedY });
  };

  // Programmatic zoom helper: zoomTo(factor, focalX, focalY)
  const zoomTo = (factor, focalX = null, focalY = null) => {
    const oldScale = scaleValueRef.current;
    let newScale = oldScale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    // if layout not ready, just animate scale around current center
    if (!mapLayout) {
      Animated.timing(scale, { toValue: newScale, duration: 300, useNativeDriver: true }).start(() => { scaleValueRef.current = newScale; });
      return;
    }

    // determine focal point in screen coords (default to center of map viewport)
    const fx = typeof focalX === 'number' ? focalX : SCREEN_WIDTH / 2;
    const fy = typeof focalY === 'number' ? focalY : (mapLayout ? (mapLayout.y + mapLayout.height / 2) : SCREEN_HEIGHT / 2);

    // compute focal in map-local coordinates
    const focal = {
      x: (fx - mapLayout.x - getPanX()) / oldScale,
      y: (fy - mapLayout.y - getPanY()) / oldScale,
    };

    const beforeX = focal.x * oldScale + lastPan.current.x;
    const beforeY = focal.y * oldScale + lastPan.current.y;
    const afterX = focal.x * newScale + lastPan.current.x;
    const afterY = focal.y * newScale + lastPan.current.y;

    const dxPan = beforeX - afterX;
    const dyPan = beforeY - afterY;

    const targetX = lastPan.current.x + dxPan;
    const targetY = lastPan.current.y + dyPan;

    // clamp pan so map stays within bounds
    const minX = SCREEN_WIDTH - MAP_WIDTH * newScale; const maxX = 0;
    const minY = Math.min(SCREEN_HEIGHT - MAP_HEIGHT * newScale, 0); const maxY = 0;
    const clampedX = Math.min(Math.max(targetX, minX), maxX);
    const clampedY = Math.min(Math.max(targetY, minY), maxY);

    Animated.parallel([
      Animated.timing(scale, { toValue: newScale, duration: 280, useNativeDriver: true }),
      Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, stiffness: 120, damping: 18, useNativeDriver: true }),
    ]).start(() => {
      scaleValueRef.current = newScale;
      lastPan.current = { x: clampedX, y: clampedY };
      try { pan.flattenOffset(); } catch (e) {}
    });
  };

  const zoomIn = (focalX = null, focalY = null) => zoomTo(1.25, focalX, focalY);
  const zoomOut = (focalX = null, focalY = null) => zoomTo(1 / 1.25, focalX, focalY);

  // NOTE: gates are NOT added to routeStops by tapping. Buildings open modal where you can choose to add.
  const onTapBuilding = (b) => {
    const exists = routeStops.find((s) => s.id === b.id);
    if (exists) setRouteStops(routeStops.filter((s) => s.id !== b.id));
    else setRouteStops([...routeStops, b]);
    setSelectedBuilding(b);
  };

  const addRoomStop = (building, roomName) => {
    const id = `${building.id}::room::${roomName}`;
    const stopObj = { id, name: `${building.name} — ${roomName}`, x: building.x, y: building.y, isRoom: true };
    const exists = routeStops.find((s) => s.id === id);
    if (exists) setRouteStops(routeStops.filter((s) => s.id !== id));
    else setRouteStops([...routeStops, stopObj]);
    setSelectedBuilding(null);
  };

  const dioramaTransforms = [{ perspective: 1000 }, { rotateX: "-10deg" }, { rotateZ: "-2deg" }, { translateY: -12 }];
  const animatedTransforms = () => {
    if (mode === "diorama") {
      // translate first, scale last — critical for correct focal zoom
      return [...dioramaTransforms, { translateX: pan.x }, { translateY: pan.y }, { scale }];
    }
    return [{ translateX: pan.x }, { translateY: pan.y }, { scale }];
  };

  // Pixel mode removed — using Normal and Diorama only

  // Small diorama shadow under each building to sell depth (size follows building height)
  const BuildingShadow = ({ b }) => {
    const floors = Math.max(1, Number(b?.floors) || Math.ceil((b?.rooms?.length || 0) / 3));
    const W = 64;
    const H = 28 + floors * 12;
    const roofHeight = 10 + Math.min(10, Math.floor(floors / 2) * 3);
    const sideOffset = Math.max(10, Math.round(H * 0.18));

    const w = Math.max(56, Math.round((W + sideOffset) * 1.05));
    const h = Math.max(12, Math.round(H * 0.14));
    const left = Math.round((W + sideOffset) / 2 - w / 2) - 2;
    const top = Math.round(H + roofHeight + sideOffset - h / 2 + 6);

    // softer, wider shadow for more realistic look
    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left,
          top,
          width: w,
          height: h,
          borderRadius: Math.round(h / 2),
          backgroundColor: "rgba(0,0,0,0.14)",
          transform: [{ scaleX: 1.9 }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 16,
          elevation: 6,
        }}
      />
    );
  };

  // Double-tap handler overlay
  const onMapTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      // double-tap: fit all
      fitAll();
    }
    lastTapRef.current = now;
  };

  // compute a scale bar width that visually responds to zoom (approx)
  const computedScaleBarWidth = Math.max(24, Math.round(36 / (scaleValueRef.current || 1)));

  // Sanitizer: ensure no plain string/number children are rendered inside non-Text components.
  // This wraps raw string/number children with <Text>, but skips react-native-svg elements.
  const SVG_TYPES = new Set([Svg, Polyline, Circle, Path, G, Rect, Polygon, Defs, LinearGradient, Stop]);

  function sanitizeElement(el) {
    if (el === null || el === undefined) return el;
    if (typeof el === 'string' || typeof el === 'number') return React.createElement(Text, null, String(el));
    if (!React.isValidElement(el)) return el;
    // If this element is an SVG element (or one of its primitives), don't traverse or wrap inside it
    if (SVG_TYPES.has(el.type)) return el;

    const children = el.props && el.props.children;
    if (!children) return el;

      const mapped = React.Children.map(children, (c) => {
        if (c === null || c === undefined) return c;
        if (typeof c === 'string' || typeof c === 'number') return React.createElement(Text, null, String(c));
        if (React.isValidElement(c)) {
          if (SVG_TYPES.has(c.type)) return c;
          return sanitizeElement(c);
        }
        return c;
      });

      // React.Children.map always returns an array (or null). Many components
      // (eg TouchableWithoutFeedback) call React.Children.only and require a
      // single React element child — passing an array (even length 1) breaks them.
      // Normalize children: pass a single element when mapped has length 1,
      // null when empty, or the array when there are multiple children.
      let normalizedChildren = mapped;
      if (Array.isArray(mapped)) {
        if (mapped.length === 0) normalizedChildren = null;
        else if (mapped.length === 1) normalizedChildren = mapped[0];
        else normalizedChildren = mapped;
      }

      try {
        return React.cloneElement(el, el.props, normalizedChildren);
      } catch (e) {
        return el;
      }
  }

  const __rawVisitorMapTree = (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color="white" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Campus Map</Text>
          <View style={{ flex: 1 }} />
          <View style={styles.modeToggleContainer}>
            <View style={[styles.modeToggleButton, styles.modeToggleActive]}>
              <Text style={[styles.modeToggleText, { color: green, fontWeight: "700" }]}>Normal</Text>
            </View>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>Tap building to open details</Text>
        <View style={styles.searchBar}><Ionicons name="search" size={18} color="#666" /><TextInput placeholder="Search buildings…" style={styles.searchInput} value={search} onChangeText={setSearch} onSubmitEditing={(e) => handleSearchSubmit(e.nativeEvent.text)} returnKeyType="search" /></View>

        {/* Autocomplete suggestions below search */}
        {search && String(search).trim().length > 0 ? (
          <View style={styles.searchDropdown}>
            {filtered && filtered.length > 0 ? (
              filtered.slice(0, 6).map((b) => (
                <TouchableOpacity
                  key={`sug-${b.id}`}
                  style={styles.suggestionItem}
                  onPress={() => {
                    try { centerOnBuilding(b); } catch (e) {}
                    setSelectedBuilding(b);
                    setFloorPlanModalVisible(true);
                    setSearch("");
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionText}>{b.name}</Text>
                    <Text style={styles.suggestionSub}>{b.department || (b.kind === 'gate' ? 'Gate' : (b.kind || 'Building'))}</Text>
                  </View>
                  <Text style={{ color: '#2a7dff', fontWeight: '700' }}>Go</Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.suggestionEmpty}><Text style={{ color: '#666' }}>No matches</Text></View>
            )}
          </View>
        ) : null}
      </View>

      {/* Alerts for sudden building changes (tap to view) */}
      {alerts && alerts.length > 0 ? (
        <View style={{ position: 'absolute', top: 90, left: 20, right: 20, zIndex: 999 }} pointerEvents="box-none">
          {alerts.map((a, i) => (
            <TouchableOpacity
              key={`${a.id}-${i}`}
              style={{ backgroundColor: '#fff4e6', padding: 10, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 6 }}
              onPress={() => {
                try {
                  if (a.building) {
                    centerOnBuilding(a.building);
                    setSelectedBuilding(a.building);
                    setFloorPlanModalVisible(true);
                  }
                } catch (e) {}
                setAlerts((prev) => prev.filter((x) => x !== a));
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{a.title}</Text>
                <Text style={{ color: '#333' }}>{a.message}</Text>
              </View>
              <TouchableOpacity onPress={() => setAlerts((prev) => prev.filter((x) => x !== a))} style={{ paddingHorizontal: 8 }}>
                <Text style={{ color: '#666' }}>Dismiss</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <ScrollView
  ref={scrollViewRef}
  showsVerticalScrollIndicator={false}
  scrollEnabled={scrollEnabled}
  contentContainerStyle={{ paddingBottom: 40 }}
  horizontal={false}  // vertical only
>
        <View
  ref={mapContainerRef}
  onLayout={(e) => setMapLayout(e.nativeEvent.layout)}
  style={[styles.mapCard, { alignItems: "center" }]}  // <-- CENTER THE MAP
>

          {/* overlay to capture double-tap separately from panResponder */}
  <PinchGestureHandler
    ref={pinchRef}
    onGestureEvent={onPinchEvent}
    onHandlerStateChange={onPinchStateChange}
  >
  <TapGestureHandler numberOfTaps={2} onHandlerStateChange={(ev) => { if ((ev.nativeEvent || {}).state === GHState.END) { fitAll(); } }}>
  <Animated.View
    {...panResponder.panHandlers}
    style={{
      width: MAP_WIDTH,  // FULL MAP WIDTH ALWAYS
      height: MAP_HEIGHT,
      transform: animatedTransforms(),
    }}
  >

              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet">
                <G strokeLinejoin="miter" strokeLinecap="square" opacity={1}>{mode === 'diorama' ? renderCampusPathsIso() : renderCampusPaths()}</G>

                {/* ---------- START: INSERTED CUSTOM ROADS ---------- */}
                {mode === 'diorama' ? renderCustomRoadsIso() : (
                  <G id="custom-roads">
                    <Rect x={MAP_WIDTH * 0.155 - MAP_WIDTH * 0.022} y={MAP_HEIGHT * 0.08} width={MAP_WIDTH * 0.044} height={MAP_HEIGHT * 0.84} rx={MAP_WIDTH * 0.02} fill={"#555"} />
                    <Path d={`M ${MAP_WIDTH * 0.155},${MAP_HEIGHT * 0.08} L ${MAP_WIDTH * 0.155},${MAP_HEIGHT * 0.92}`} stroke={"#dcdcdc"} strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />

                    <Rect x={MAP_WIDTH * 0.780 - MAP_WIDTH * 0.022} y={MAP_HEIGHT * 0.08} width={MAP_WIDTH * 0.044} height={MAP_HEIGHT * 0.84} rx={MAP_WIDTH * 0.02} fill={"#555"} />
                    <Path d={`M ${MAP_WIDTH * 0.780},${MAP_HEIGHT * 0.08} L ${MAP_WIDTH * 0.780},${MAP_HEIGHT * 0.92}`} stroke={"#dcdcdc"} strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />

                    
                    <Rect x={MAP_WIDTH * 0.155 - MAP_WIDTH * 0.002} y={MAP_HEIGHT * 0.52 - MAP_HEIGHT * 0.04} width={(MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.155)} height={MAP_HEIGHT * 0.08} rx={MAP_WIDTH * 0.02} fill={"#555"} />
                    <Path d={`M ${MAP_WIDTH * 0.155},${MAP_HEIGHT * 0.52} L ${MAP_WIDTH * 0.780},${MAP_HEIGHT * 0.52}`} stroke={"#dcdcdc"} strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />

                    <Rect x={MAP_WIDTH * 0.155 - MAP_WIDTH * 0.002} y={MAP_HEIGHT * 0.76 - MAP_HEIGHT * 0.04} width={(MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.155)} height={MAP_HEIGHT * 0.08} rx={MAP_WIDTH * 0.02} fill={"#555"} />
                    <Path d={`M ${MAP_WIDTH * 0.155},${MAP_HEIGHT * 0.76} L ${MAP_WIDTH * 0.780},${MAP_HEIGHT * 0.76}`} stroke={"#dcdcdc"} strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />

                    <Rect x={MAP_WIDTH * 0.580 - MAP_WIDTH * 0.002} y={MAP_HEIGHT * 0.18 - MAP_HEIGHT * 0.04} width={(MAP_WIDTH * 0.780) - (MAP_WIDTH * 0.580)} height={MAP_HEIGHT * 0.08} rx={MAP_WIDTH * 0.02} fill={"#555"} />
                    <Path d={`M ${MAP_WIDTH * 0.580},${MAP_HEIGHT * 0.18} L ${MAP_WIDTH * 0.780},${MAP_HEIGHT * 0.18}`} stroke={"#dcdcdc"} strokeWidth={MAP_WIDTH * 0.004} strokeDasharray={`${MAP_WIDTH * 0.03} ${MAP_WIDTH * 0.022}`} strokeLinecap="round" />
                  </G>
                )}

                {/* Courts are removed from the default map — admin will add them via the admin UI */}
                {/* ---------- END: INSERTED CUSTOM ROADS ---------- */}

                {routePoints.length >= 2 && (
                  <>
                    <Polyline points={polylinePointsString(routePoints)} fill="none" stroke={green} strokeWidth={18} strokeLinecap="square" strokeLinejoin="miter" />
                      <Polyline points={polylinePointsString(routePoints)} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="square" strokeLinejoin="miter" />
                    {routePoints.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={6} fill="#fff" stroke={green} strokeWidth={3} />)}
                  </>
                )}
                {/* ---------- BUILDINGS / COURTS / TREES (render in normal mode as simple markers) ---------- */}
                {(() => {
                  const list = filtered.filter((it) => it.kind !== "gate").slice();
                  // keep stable ordering
                  list.sort((a, b) => (Number(a.x || 0) + Number(a.y || 0)) - (Number(b.x || 0) + Number(b.y || 0)));

                  // If diorama were enabled we'd render iso blocks; in normal mode render simple markers
                  if (mode === 'diorama') {
                    return list.map((b) => {
                      const baseColor = b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general;
                      const floors = Math.max(1, Number(b?.floors) || Math.ceil((b?.rooms?.length || 0) / 3));
                      const iso = worldToIso(Number(b.x) || 0, Number(b.y) || 0);

                      const roofCenter = { x: iso.x, y: iso.y - floors * FLOOR_H };
                      const halfW = TILE_W / 2;
                      const halfH = TILE_H / 2;

                      const pTop = { x: roofCenter.x, y: roofCenter.y - halfH };
                      const pRight = { x: roofCenter.x + halfW, y: roofCenter.y };
                      const pBottom = { x: roofCenter.x, y: roofCenter.y + halfH };
                      const pLeft = { x: roofCenter.x - halfW, y: roofCenter.y };

                      const drop = floors * FLOOR_H;
                      const gLeft = { x: pLeft.x, y: pLeft.y + drop };
                      const gRight = { x: pRight.x, y: pRight.y + drop };
                      const gBottom = { x: pBottom.x, y: pBottom.y + drop };

                      const roofPoints = `${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`;
                      const leftFace = `${pLeft.x},${pLeft.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gLeft.x},${gLeft.y}`;
                      const rightFace = `${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gRight.x},${gRight.y}`;

                      const roofColor = lighten(baseColor, 0.04);
                      const leftColor = darken(baseColor, 0.12);
                      const rightColor = darken(baseColor, 0.06);

                      return (
                        <G key={`iso-${b.id}`} onPress={() => setSelectedBuilding(b)}>
                          <Ellipse cx={iso.x} cy={iso.y + 6} rx={TILE_W * 0.8} ry={TILE_H * 0.5} fill="rgba(0,0,0,0.12)" />
                          <Polygon points={leftFace} fill={leftColor} stroke={darken(leftColor, 0.06)} strokeWidth={0.5} />
                          <Polygon points={rightFace} fill={rightColor} stroke={darken(rightColor, 0.04)} strokeWidth={0.5} />
                          <Polygon points={roofPoints} fill={roofColor} stroke={darken(roofColor, 0.08)} strokeWidth={0.6} />
                        </G>
                      );
                    });
                  }

                  // Normal mode: compute simple screen-space clusters and render clusters or individual markers
                  const clusters = (() => {
                    try {
                      const s = scaleValueRef.current || 1;
                      const px = getPanX();
                      const py = getPanY();
                      const items = list.map((b) => ({ ...b, _screenX: (Number(b.x) || 0) * s + px, _screenY: (Number(b.y) || 0) * s + py, _clusterable: !(['tree','court','gate'].includes(b.kind)) }));
                      const used = new Set();
                      const out = [];
                      const THRESH = 32; // pixels (reduced to avoid over-clustering)
                      for (let i = 0; i < items.length; i++) {
                        if (used.has(i)) continue;
                        const a = items[i];
                        // if the item is not clusterable (eg. trees), keep it as single member
                        if (!a._clusterable) {
                          used.add(i);
                          out.push({ members: [a] });
                          continue;
                        }
                        const cluster = { members: [a], sx: a._screenX, sy: a._screenY };
                        used.add(i);
                        for (let j = i + 1; j < items.length; j++) {
                          if (used.has(j)) continue;
                          const b = items[j];
                          // never cluster with non-clusterable items
                          if (!b._clusterable) continue;
                          const dx = a._screenX - b._screenX;
                          const dy = a._screenY - b._screenY;
                          if (Math.sqrt(dx * dx + dy * dy) <= THRESH) {
                            cluster.members.push(b);
                            used.add(j);
                          }
                        }
                        out.push(cluster);
                      }
                      return out.map((c) => {
                        if (!c || !c.members) return null;
                        if (c.members.length === 1) return { type: 'item', item: c.members[0] };
                        const avgX = c.members.reduce((s, m) => s + (Number(m.x) || 0), 0) / c.members.length;
                        const avgY = c.members.reduce((s, m) => s + (Number(m.y) || 0), 0) / c.members.length;
                        return { type: 'cluster', count: c.members.length, x: avgX, y: avgY, members: c.members };
                      }).filter(Boolean);
                    } catch (e) {
                      return list.map((b) => ({ type: 'item', item: b }));
                    }
                  })();

                  return clusters.map((entry, idx) => {
                    if (!entry) return null;
                    if (entry.type === 'cluster') {
                      const cx = Number(entry.x) || 0;
                      const cy = Number(entry.y) || 0;
                      const cnt = entry.count || 0;
                      const r = Math.min(28, 8 + cnt * 3);
                      return (
                        <G key={`cluster-${idx}`}>
                          <G onPress={() => handleClusterTap(entry)}>
                            <Circle cx={cx} cy={cy} r={r} fill="#2a7dff" stroke="#123" strokeWidth={1.2} opacity={0.95} />
                            <SvgText x={cx} y={cy + 4} fontSize={12} fontWeight="800" fill="#fff" textAnchor="middle">{String(cnt)}</SvgText>
                          </G>
                          {/* render spiderfy items if active for this cluster */}
                          {spiderfy && spiderfy.center && spiderfy.center.x === cx && spiderfy.center.y === cy ? (
                            spiderfy.positions.map((p, i) => {
                              const mb = p.member;
                              const mbx = Number(p.x) || 0;
                              const mby = Number(p.y) || 0;
                              // render a small tappable circle with glyph
                              return (
                                <G key={`sp-${idx}-${i}`} onPress={() => { setSelectedBuilding(mb); setSpiderfy(null); setFloorPlanModalVisible(true); }}>
                                  <Circle cx={mbx} cy={mby} r={18} fill="#fff" stroke="#2a7dff" strokeWidth={2} />
                                  <SvgText x={mbx} y={mby + 4} fontSize={12} fontWeight="800" fill="#2a7dff" textAnchor="middle">{mb.name && String(mb.name).slice(0,1)}</SvgText>
                                </G>
                              );
                            })
                          ) : null}
                        </G>
                      );
                    }

                    const b = entry.item;
                    const bx = Number(b.x) || 0;
                    const by = Number(b.y) || 0;
                    const baseColor = b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general;
                    const strokeColor = darken(baseColor, 0.12);

                    if (b.kind === 'tree') {
                      // low-poly stylized tree: three stacked triangular foliage layers + trunk
                      const canopyTop = lighten(baseColor, 0.06);
                      const canopyMid = baseColor;
                      const canopyBot = darken(baseColor, 0.06);
                      const strokeTop = darken(canopyTop, 0.12);
                      const strokeMid = darken(canopyMid, 0.12);
                      const strokeBot = darken(canopyBot, 0.12);
                      const trunkColor = darken(baseColor, 0.45);

                      const topPts = `${bx},${by - 28} ${bx - 12},${by - 14} ${bx + 12},${by - 14}`;
                      const midPts = `${bx},${by - 16} ${bx - 16},${by + 2} ${bx + 16},${by + 2}`;
                      const botPts = `${bx},${by - 6} ${bx - 20},${by + 16} ${bx + 20},${by + 16}`;

                      return (
                        <G key={`tree-${b.id}`} onPress={() => setSelectedBuilding(b)}>
                          {/* pixelated ground shadow */}
                          <Ellipse cx={bx} cy={by + 22} rx={18} ry={6} fill="rgba(0,0,0,0.18)" />

                          {/* bottom (largest) foliage layer - pixelated */}
                          <Polygon points={botPts} fill={canopyBot} stroke={strokeBot} strokeWidth={1.2} />
                          {/* mid foliage layer */}
                          <Polygon points={midPts} fill={canopyMid} stroke={strokeMid} strokeWidth={1.2} />
                          {/* top foliage layer */}
                          <Polygon points={topPts} fill={canopyTop} stroke={strokeTop} strokeWidth={1.2} />

                          {/* pixelated facet detail: a small inner triangle on mid layer */}
                          <Polygon points={`${bx},${by - 12} ${bx - 8},${by + 2} ${bx + 8},${by + 2}`} fill={darken(canopyMid, 0.12)} opacity={0.9} />

                          {/* pixelated trunk */}
                          <Rect x={bx - 4} y={by + 16} width={8} height={12} rx={0.5} fill={trunkColor} stroke={darken(trunkColor, 0.2)} strokeWidth={1.0} />
                        </G>
                      );
                    }

                    if (b.kind === 'court') {
                      // support multiple court visuals: basketball (default), soccer, baseball
                      const type = (b.courtType || '').toLowerCase();
                      const courtColor = b.color || '#d9b382';
                      const w = 44;
                      const h = 28;
                      const left = bx - w / 2;
                      const top = by - h / 2;

                      // Soccer field: green rectangle with center circle and goal marks
                      if (type === 'soccer' || type === 'football') {
                        const fieldGreen = b.color || '#1faa59';
                        const lineColor = '#ffffff';
                        const centerR = 6;
                        return (
                          <G key={`court-soccer-${b.id}`} onPressIn={() => startLongPress(b)} onPressOut={() => endLongPress(b)} onPress={() => { setSelectedBuilding(b); }}>
                            <Rect x={left} y={top} width={w} height={h} rx={3} fill={fieldGreen} stroke={darken(fieldGreen, 0.12)} strokeWidth={1.4} />
                            {/* halfway line */}
                            <Path d={`M ${bx},${top + 4} L ${bx},${top + h - 4}`} stroke={lineColor} strokeWidth={1.8} strokeLinecap="round" opacity={0.95} />
                            {/* center circle */}
                            <Circle cx={bx} cy={by} r={centerR} fill="none" stroke={lineColor} strokeWidth={1.6} />
                            {/* small goal markers */}
                            <Path d={`M ${left + 2},${by - 6} L ${left + 2},${by + 6}`} stroke={lineColor} strokeWidth={1.2} />
                            <Path d={`M ${left + w - 2},${by - 6} L ${left + w - 2},${by + 6}`} stroke={lineColor} strokeWidth={1.2} />
                          </G>
                        );
                      }

                      // Baseball diamond: rotated square (diamond) with infield dirt and base markers
                      if (type === 'baseball' || type === 'diamond') {
                        const grass = b.color || '#6fcf73';
                        const dirt = '#d99a5a';
                        const cx = bx;
                        const cy = by;
                        const size = Math.min(w, h) * 0.7;
                        const half = size / 2;
                        // diamond points (rotated square)
                        const pTop = `${cx},${cy - half}`;
                        const pRight = `${cx + half},${cy}`;
                        const pBottom = `${cx},${cy + half}`;
                        const pLeft = `${cx - half},${cy}`;
                        return (
                          <G key={`court-baseball-${b.id}`} onPressIn={() => startLongPress(b)} onPressOut={() => endLongPress(b)} onPress={() => { setSelectedBuilding(b); }}>
                            {/* background grass */}
                            <Rect x={left - 6} y={top - 6} width={w + 12} height={h + 12} rx={4} fill={grass} stroke={darken(grass, 0.1)} strokeWidth={1.2} />
                            {/* infield dirt as rotated square/diamond */}
                            <Polygon points={`${pTop} ${pRight} ${pBottom} ${pLeft}`} fill={dirt} stroke={darken(dirt, 0.12)} strokeWidth={1.2} />
                            {/* pitcher's mound */}
                            <Circle cx={cx} cy={cy} r={3} fill={darken(dirt, 0.06)} />
                            {/* bases (small white squares) */}
                            <Rect x={cx - 4} y={cy - half - 4} width={8} height={8} rx={1} fill="#fff" stroke="#eee" />
                            <Rect x={cx + half - 4} y={cy - 4} width={8} height={8} rx={1} fill="#fff" stroke="#eee" />
                            <Rect x={cx - 4} y={cy + half - 4} width={8} height={8} rx={1} fill="#fff" stroke="#eee" />
                            <Rect x={cx - half - 4} y={cy - 4} width={8} height={8} rx={1} fill="#fff" stroke="#eee" />
                          </G>
                        );
                      }

                      // default: basketball-like rounded rectangle with center line and markers
                      const centerX = bx;
                      const centerY = by;
                      const backColor = courtColor || '#d9b382';
                      // render as rounded square with basketball glyph (white)
                      const sizeR = Math.min(w, h) * 0.45;
                      const ballR = Math.max(6, Math.floor(sizeR * 0.72));
                      const cx = centerX;
                      const cy = centerY;
                      return (
                        <G key={`court-${b.id}`} onPressIn={() => startLongPress(b)} onPressOut={() => endLongPress(b)} onPress={() => { setSelectedBuilding(b); }}>
                          {/* rounded square background */}
                          <Rect x={left} y={top} width={w} height={h} rx={8} fill={backColor} stroke={darken(backColor, 0.12)} strokeWidth={1.2} />

                          {/* basketball white circle */}
                          <Circle cx={cx} cy={cy} r={ballR} fill="none" stroke="#fff" strokeWidth={1.6} />

                          {/* vertical curved seams */}
                          <Path d={`M ${cx},${cy - ballR} Q ${cx + ballR * 0.5},${cy} ${cx},${cy + ballR}`} stroke="#fff" strokeWidth={1.4} fill="none" strokeLinecap="round" />
                          <Path d={`M ${cx},${cy - ballR} Q ${cx - ballR * 0.5},${cy} ${cx},${cy + ballR}`} stroke="#fff" strokeWidth={1.4} fill="none" strokeLinecap="round" />

                          {/* horizontal curved seams */}
                          <Path d={`M ${cx - ballR},${cy} Q ${cx},${cy - ballR * 0.45} ${cx + ballR},${cy}`} stroke="#fff" strokeWidth={1.4} fill="none" strokeLinecap="round" />
                          <Path d={`M ${cx - ballR},${cy} Q ${cx},${cy + ballR * 0.45} ${cx + ballR},${cy}`} stroke="#fff" strokeWidth={1.4} fill="none" strokeLinecap="round" />
                        </G>
                      );
                    }

                    // default building marker — render a compact isometric block (pixelated style)
                    {
                      const floors = Math.max(1, Number(b?.floors) || Math.ceil((b?.rooms?.length || 0) / 3));
                      // Use plain map coordinates (bx,by) so buildings render where admins place them
                      const center = { x: bx, y: by };
                      const roofCenter = { x: center.x, y: center.y - floors * FLOOR_H };
                      const halfW = TILE_W / 2;
                      const halfH = TILE_H / 2;

                      const pTop = { x: roofCenter.x, y: roofCenter.y - halfH };
                      const pRight = { x: roofCenter.x + halfW, y: roofCenter.y };
                      const pBottom = { x: roofCenter.x, y: roofCenter.y + halfH };
                      const pLeft = { x: roofCenter.x - halfW, y: roofCenter.y };

                      const drop = floors * FLOOR_H;
                      const gLeft = { x: pLeft.x, y: pLeft.y + drop };
                      const gRight = { x: pRight.x, y: pRight.y + drop };
                      const gBottom = { x: pBottom.x, y: pBottom.y + drop };

                      const roofPoints = `${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`;
                      const leftFace = `${pLeft.x},${pLeft.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gLeft.x},${gLeft.y}`;
                      const rightFace = `${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${gBottom.x},${gBottom.y} ${gRight.x},${gRight.y}`;

                      const roofColor = lighten(baseColor, 0.08);
                      const leftColor = darken(baseColor, 0.18);
                      const rightColor = darken(baseColor, 0.10);

                      // small window grid for front face
                      const name = (b.name || "").length > 12 ? (b.name || "").slice(0, 11) + "…" : (b.name || "");
                      const winCols = 2;
                      const winRows = Math.min(3, Math.max(1, floors));
                      const winW = 4;
                      const winH = 6;
                      const winXStart = roofCenter.x + halfW * 0.2;
                      const winYStart = roofCenter.y - halfH * 0.1;

                      const bubbleW = Math.max(48, Math.min(120, name.length * 8 + 24));
                      const bubbleH = 24;
                      const bubbleX = center.x - bubbleW / 2;
                      const bubbleY = roofCenter.y - halfH - bubbleH - 8;
                      // Clamp bubble horizontally so it remains fully visible inside the map
                      const clampedBubbleX = Math.max(6, Math.min((MAP_WIDTH || 0) - bubbleW - 6, bubbleX));
                      // keep pointer aligned to building but ensure it stays within bubble bounds
                      const pointerCenterX = Math.max(clampedBubbleX + 8, Math.min(clampedBubbleX + bubbleW - 8, center.x));

                      return (
                        <G key={`pt-${b.id}`} onPress={() => setSelectedBuilding(b)}>
                          {/* pixelated shadow */}
                          <Ellipse cx={center.x} cy={center.y + 8} rx={TILE_W * 0.85} ry={TILE_H * 0.45} fill="rgba(0,0,0,0.18)" />

                          {/* building faces - pixelated style with stronger borders */}
                          <Polygon points={leftFace} fill={leftColor} stroke={darken(leftColor, 0.12)} strokeWidth={1.0} />
                          <Polygon points={rightFace} fill={rightColor} stroke={darken(rightColor, 0.10)} strokeWidth={1.0} />
                          <Polygon points={roofPoints} fill={roofColor} stroke={darken(roofColor, 0.15)} strokeWidth={1.2} />

                          {/* pixelated rooftop flag */}
                          <Path d={`M ${roofCenter.x - 6},${roofCenter.y - halfH + 2} L ${roofCenter.x - 6},${roofCenter.y - halfH - 10}`} stroke={darken(roofColor,0.5)} strokeWidth={1.5} />
                          <Path d={`M ${roofCenter.x - 6},${roofCenter.y - halfH - 10} L ${roofCenter.x},${roofCenter.y - halfH - 6} L ${roofCenter.x - 6},${roofCenter.y - halfH - 2} Z`} fill={lighten(roofColor,0.12)} stroke={darken(roofColor,0.2)} strokeWidth={0.8} />

                          {/* windows on front/right face - pixelated style */}
                          {Array.from({ length: winRows }).map((_, r) => (
                            Array.from({ length: winCols }).map((__, c) => {
                              const wx = winXStart + c * (winW + 4);
                              const wy = winYStart + r * (winH + 4);
                              return <Rect key={`w-${b.id}-${r}-${c}`} x={wx} y={wy} width={winW} height={winH} rx={0.5} fill="#ffffff" opacity={0.9} stroke={darken(baseColor, 0.3)} strokeWidth={0.8} />;
                            })
                          ))}

                          {/* name bubble - pixelated style */}
                          <G>
                            <Rect x={clampedBubbleX} y={bubbleY} width={bubbleW} height={bubbleH} rx={bubbleH / 2} fill="#ffffff" stroke="rgba(0,0,0,0.15)" strokeWidth={1.5} />
                            <Polygon points={`${pointerCenterX - 6},${bubbleY + bubbleH} ${pointerCenterX + 6},${bubbleY + bubbleH} ${pointerCenterX},${bubbleY + bubbleH + 8}`} fill="#ffffff" stroke="rgba(0,0,0,0.15)" strokeWidth={1.0} />
                            <SvgText x={clampedBubbleX + bubbleW / 2} y={bubbleY + bubbleH / 2 + 4} fontSize={11} fontWeight="800" fill="#222" textAnchor="middle">{name}</SvgText>
                          </G>
                        </G>
                      );
                    }
                  });
                })()}
              </Svg>

              {/* Invisible touch overlays for buildings/courts (make them as tappable as gates) */}
              {filtered.filter((it) => it.kind !== 'gate').map((b) => {
                const bx = Number(b.x) || 0;
                const by = Number(b.y) || 0;
                const size = b.kind === 'tree' ? 36 : 56;
                return (
                  <React.Fragment key={`touch-${b.id}`}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => { setSelectedBuilding(b); setFloorPlanModalVisible(false); }}
                      onLongPress={() => { startLongPress(b); }}
                      onPressOut={() => { endLongPress(b); }}
                      style={{ position: 'absolute', left: bx - size / 2, top: by - size / 2, width: size, height: size, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}
                    />
                    {b.kind === 'building' ? (
                      <TouchableOpacity
                        key={`fav-${b.id}`}
                        onPress={(e) => { e.stopPropagation && e.stopPropagation(); toggleFavorite(b.id); }}
                        style={{ position: 'absolute', left: bx + size / 2 - 20, top: by - size / 2 - 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name={favorites.has(b.id) ? 'star' : 'star-outline'} size={18} color={favorites.has(b.id) ? '#ffd700' : 'rgba(0,0,0,0.45)'} />
                      </TouchableOpacity>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {/* If spiderfy active, render tappable overlays for spiderfied items so touches land properly */}
              {spiderfy && spiderfy.positions ? spiderfy.positions.map((p, i) => (
                <TouchableOpacity key={`sp-touch-${i}`} style={{ position: 'absolute', left: (p.x || 0) - 22, top: (p.y || 0) - 22, width: 44, height: 44, backgroundColor: 'transparent' }} onPress={() => { setSelectedBuilding(p.member); setFloorPlanModalVisible(true); setSpiderfy(null); }} />
              )) : null}

              <Text style={styles.mapHint}>Tap a building or court to open details • Use modal to add to route</Text>

              {/* gates first */}
              {filtered.filter((it) => it.kind === "gate").map((g) => renderGate(g))}

              {walkerPos && (
                <View pointerEvents="none" style={{ position: "absolute", left: walkerPos.x - 24, top: walkerPos.y - 24, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [
                          {
                            scale: Animated.multiply(
                              pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.0] }),
                              Animated.divide(1, scale)
                            ),
                          },
                        ],
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                      },
                    ]}
                  />
                  <View style={[styles.pulseDot, mode === "diorama" ? styles.pulseDotDiorama : null]} />
                </View>
              )}

              {youPos && (
                <View pointerEvents="none" style={{ position: "absolute", left: youPos.x - 18, top: youPos.y - 18, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                  <Animated.View
                    style={[
                      styles.youPulseRing,
                      {
                        transform: [
                          {
                            scale: Animated.multiply(
                              youPulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }),
                              Animated.divide(1, scale)
                            ),
                          },
                        ],
                        opacity: youPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                      },
                    ]}
                  />
                  <View style={[styles.youDot]} />
                </View>
              )}

              

                  {mode === "diorama" && <View pointerEvents="none" style={styles.vignette} />}
                  </Animated.View>
        </TapGestureHandler>
        </PinchGestureHandler>

            <Animated.View pointerEvents="box-none" style={[styles.legendContainer, { opacity: legendOpacity }]}>
            <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: "#fff" }]} /><Text style={styles.legendLabel}>Building</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: "#2a7dff", borderRadius: 8 }]} /><Text style={styles.legendLabel}>Gate</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: "#1faa59", width: 12, height: 12, borderRadius: 6 }]} /><Text style={styles.legendLabel}>You</Text></View>

            {/* Inline filter chips */}
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <TouchableOpacity onPress={() => toggleKind('building')} style={[styles.filterChip, visibility.building ? styles.filterOn : styles.filterOff]}><Text style={styles.filterText}>Buildings</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => toggleKind('court')} style={[styles.filterChip, visibility.court ? styles.filterOn : styles.filterOff]}><Text style={styles.filterText}>Courts</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => toggleKind('gate')} style={[styles.filterChip, visibility.gate ? styles.filterOn : styles.filterOff]}><Text style={styles.filterText}>Gates</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => toggleKind('tree')} style={[styles.filterChip, visibility.tree ? styles.filterOn : styles.filterOff]}><Text style={styles.filterText}>Trees</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => toggleKind('poi')} style={[styles.filterChip, visibility.poi ? styles.filterOn : styles.filterOff]}><Text style={styles.filterText}>POIs</Text></TouchableOpacity>
            </View>

            <View style={[styles.legendItem, { marginTop: 6 }]}> <View style={[styles.scaleBar, { width: computedScaleBarWidth }]} /><Text style={[styles.legendLabel, { marginLeft: 8 }]}>{"100 m"}</Text></View>
          </Animated.View>

        </View>

        {/* route controls */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <Text style={styles.sectionTitle}>Route Stops</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {routeStops.length === 0 && <Text style={{ color: "#666" }}>No stops added — tap buildings on map</Text>}
            {routeStops.map((s) => (<View key={s.id} style={styles.stopChip}><Text style={{ color: "white", fontWeight: "700" }}>{s.name}</Text><TouchableOpacity onPress={() => setRouteStops(routeStops.filter((r) => r.id !== s.id))}><Text style={{ color: "white", marginLeft: 8 }}>✕</Text></TouchableOpacity></View>))}
          </View>

          <View style={{ flexDirection: "row", marginTop: 14, gap: 10 }}>
            <TouchableOpacity style={styles.startBtn} onPress={() => { if (routeStops.length === 1) { const gate = findPrimaryGate(); if (gate && gate.id !== routeStops[0].id) { setRouteStops([gate, routeStops[0]]); setTimeout(() => startRouteAnimation(5000), 150); return; } } if (routePoints.length >= 2) startRouteAnimation(5000); }}><Text style={{ color: "white", fontWeight: "700" }}>Start Route</Text></TouchableOpacity>
            <TouchableOpacity style={styles.clearBtn} onPress={clearRoute}><Text style={{ color: "white", fontWeight: "700" }}>Clear</Text></TouchableOpacity>
            <TouchableOpacity style={styles.centerBtn} onPress={() => { const gate = findPrimaryGate(); if (gate) centerOnBuilding(gate); }}><Text style={{ color: "white", fontWeight: "700" }}>Center Gate</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.centerBtn, { backgroundColor: "#2e7d32" }]} onPress={fitAll}><Text style={{ color: "white", fontWeight: "700" }}>Fit All</Text></TouchableOpacity>
          </View>

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>Directions</Text>
            {routeStops.length === 0 && <Text style={{ color: "#666", marginTop: 6 }}>Add stops to see directions</Text>}
            {directionsList.length > 0 ? (
              directionsList.map((d, i) => <Text key={`dir-${i}`} style={{ marginTop: 6 }}>{`${i + 1}. ${d}`}</Text>)
            ) : (
              routeStops.map((s, idx) => <Text key={s.id} style={{ marginTop: 6 }}>{`${idx + 1}. ${idx === 0 ? "Start at " : "Arrive at " } ${s.name}`}</Text>)
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tap the Building below - view exterior image and floor plan </Text>
        {filtered.filter((it) => it.kind !== 'tree').map((it) => (
          <TouchableOpacity
            key={it.id}
            style={styles.itemCard}
            onPress={() => {
              // ALWAYS open floor plan modal (even if no floorPlan)
              setSelectedBuilding(it);
              setFloorPlanModalVisible(true);

              // AUTO SCROLL TO MAP: use mapLayout if available
              // Scroll so map becomes visible near top of screen
              setTimeout(() => {
                if (mapLayout && scrollViewRef.current) {
                  // mapLayout.y is relative to the ScrollView content — scroll to it
                  scrollViewRef.current.scrollTo({
                    y: Math.max(0, mapLayout.y - 20),
                    animated: true,
                  });
                } else if (mapContainerRef.current && scrollViewRef.current) {
                  // fallback: try measure
                  mapContainerRef.current.measure((fx, fy, width, height, px, py) => {
                    scrollViewRef.current.scrollTo({
                      y: Math.max(0, py - 20),
                      animated: true,
                    });
                  });
                }
              }, 160);
            }}
          >
            <Text style={styles.itemTitle}>{it.name}</Text>
            <Text style={styles.itemSub}>{it.kind === "gate" ? "Gate" : it.department || ""}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* modal for details (both buildings and gates) */}
      <Modal visible={!!selectedBuilding && !floorPlanModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name={selectedBuilding?.kind === "gate" ? "log-in" : "business"} size={26} color="white" />
              <Text style={styles.modalHeaderText}>{selectedBuilding?.name}</Text>
            </View>

            <View style={{ padding: 20 }}>
              {selectedBuilding?.department && (<View style={styles.modalRow}><Ionicons name="school" size={20} color="#2e7d32" /><Text style={styles.modalInfo}>{selectedBuilding.department}</Text></View>)}
              <View style={styles.modalRow}><Ionicons name="walk" size={20} color="#2e7d32" /><Text style={styles.modalInfo}>~{calculateWalkingTime(selectedBuilding?.stepsFromMainGate)} min walk</Text></View>

              {selectedBuilding?.kind === "gate" && selectedBuilding?.gateIcon && (<View style={{ marginTop: 10 }}><Image source={{ uri: selectedBuilding.gateIcon }} style={{ width: "100%", height: 140, borderRadius: 8 }} resizeMode="cover" /></View>)}

              {selectedBuilding?.rooms?.length > 0 && (<View style={{ marginTop: 15 }}><Text style={styles.modalRoomsTitle}>Rooms</Text>{selectedBuilding.rooms.map((room, i) => (<Text key={i} style={styles.modalRoomItem}>• {room}</Text>))}</View>)}

              {/* quick actions */}
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontWeight: "700", marginBottom: 8 }}>Quick actions</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {selectedBuilding?.kind !== "gate" && (<TouchableOpacity style={[styles.startBtn, { paddingHorizontal: 12 }]} onPress={() => { const exists = routeStops.find((s) => s.id === selectedBuilding.id); if (exists) setRouteStops(routeStops.filter((s) => s.id !== selectedBuilding.id)); else setRouteStops([...routeStops, selectedBuilding]); setSelectedBuilding(null); }}><Text style={{ color: "white", fontWeight: "700" }}>Add Building to Route</Text></TouchableOpacity>)}
                  {selectedBuilding?.kind === "gate" && (
                    <TouchableOpacity style={[styles.startBtn, { paddingHorizontal: 12 }]}
                      onPress={() => {
                        const exists = routeStops.find((s) => s.id === selectedBuilding.id);
                        if (exists) setRouteStops(routeStops.filter((s) => s.id !== selectedBuilding.id));
                        else setRouteStops([...routeStops, selectedBuilding]);
                        setSelectedBuilding(null);
                      }}>
                      <Text style={{ color: "white", fontWeight: "700" }}>Add Gate to Route</Text>
                    </TouchableOpacity>
                  )}
                  {selectedBuilding?.rooms?.length > 0 && (<TouchableOpacity style={[styles.centerBtn, { paddingHorizontal: 12 }]} onPress={() => {}}><Text style={{ color: "white", fontWeight: "700" }}>Pick Room</Text></TouchableOpacity>)}
                </View>
                {selectedBuilding?.rooms?.length > 0 && (<View style={{ marginTop: 12 }}><Text style={{ fontWeight: "700" }}>Rooms</Text><View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>{selectedBuilding.rooms.map((room, i) => <TouchableOpacity key={i} style={styles.roomChip} onPress={() => addRoomStop(selectedBuilding, room)}><Text style={{ color: "#333" }}>{room}</Text></TouchableOpacity>)}</View></View>)}
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedBuilding(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* FLOOR PLAN ONLY MODAL */}
      <Modal visible={floorPlanModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="image" size={26} color="white" />
              <Text style={styles.modalHeaderText}>{selectedBuilding?.name}</Text>
            </View>

            <View style={{ padding: 20 }}>
              {/* Combined building info + floor plan image. Use floorPlan as primary visual and overlay highlight for selected room. */}
              <View style={{ marginBottom: 10 }}>
                {selectedBuilding?.department && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="school" size={16} color="#2e7d32" /><Text style={{ color: '#333' }}>{selectedBuilding.department}</Text></View>)}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Ionicons name="walk" size={16} color="#2e7d32" />
                  <Text style={{ color: '#333' }}>~{calculateWalkingTime(selectedBuilding?.stepsFromMainGate)} min walk</Text>
                </View>
              </View>

              {(selectedBuilding?.photo || selectedBuilding?.floorPlan) ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center' }}
                >
                  {selectedBuilding?.photo ? (
                    <View style={{ width: VISITOR_MODAL_INNER, height: 180, alignSelf: 'center' }}>
                      <Image source={{ uri: selectedBuilding.photo }} style={{ width: '100%', height: '100%', borderRadius: 12 }} resizeMode="cover" />
                    </View>
                  ) : null}

                  {selectedBuilding?.floorPlan ? (
                    <View style={{ width: VISITOR_MODAL_INNER, height: 180, alignSelf: 'center' }}>
                      <Image source={{ uri: selectedBuilding.floorPlan }} style={{ width: '100%', height: '100%', borderRadius: 12 }} resizeMode="contain" />
                      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
                        <Svg width="100%" height="100%" viewBox={`0 0 ${VISITOR_MODAL_INNER} 180`} preserveAspectRatio="xMidYMid slice">
                          {(() => {
                            const meta = selectedBuilding?.roomPolygons || ROOM_POLYGONS[selectedBuilding?.id] || {};
                            const entries = Object.entries(meta || {});
                            if (!entries.length) return null;
                            return entries.map(([name, poly], idx) => {
                              if (!poly || !poly.length) return null;
                              const pts = poly.map((p) => `${Math.round(p.x * VISITOR_MODAL_INNER)},${Math.round(p.y * 180)}`).join(' ');
                              const cx = (poly.reduce((s, p) => s + p.x, 0) / poly.length) * VISITOR_MODAL_INNER;
                              const cy = (poly.reduce((s, p) => s + p.y, 0) / poly.length) * 180;
                              const isActive = selectedRoom === name;

                              const xs = poly.map((p) => p.x * VISITOR_MODAL_INNER);
                              const ys = poly.map((p) => p.y * 180);
                              const minX = Math.min(...xs); const maxX = Math.max(...xs);
                              const minY = Math.min(...ys); const maxY = Math.max(...ys);
                              const wPx = Math.max(0, maxX - minX); const hPx = Math.max(0, maxY - minY);
                              const isTiny = Math.min(wPx, hPx) < 28;

                              const polyFill = isActive ? "rgba(30,200,80,0.45)" : (isTiny ? "rgba(30,200,30,0.22)" : "rgba(30,200,30,0.12)");
                              const polyStroke = isActive ? darken('#1faa59', 0.12) : 'rgba(0,0,0,0.08)';
                              const strokeW = isActive ? 2.5 : (isTiny ? 1.8 : 1);

                              return (
                                <G key={`${selectedBuilding?.id}-${name}-${idx}`}>
                                  <Polygon points={pts} fill={polyFill} stroke={polyStroke} strokeWidth={strokeW} />
                                  {isTiny ? (
                                    <G>
                                      <Circle cx={cx} cy={cy} r={isActive ? 10 : 8} fill={isActive ? 'rgba(31,150,70,0.95)' : 'rgba(255,255,255,0.9)'} stroke={isActive ? darken('#1faa59', 0.18) : 'rgba(0,0,0,0.12)'} strokeWidth={isActive ? 2 : 1} />
                                      <Circle cx={cx} cy={cy} r={isActive ? 5 : 4} fill={isActive ? '#fff' : '#1faa59'} opacity={isActive ? 0.14 : 0.85} />
                                    </G>
                                  ) : null}
                                </G>
                              );
                            });
                          })()}
                        </Svg>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ textAlign: 'center', marginTop: 20 }}>No exterior photo or floor plan uploaded.</Text>
              )}

              {/* Rooms selection section (replaces previous "Quick actions") */}
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Select a Room</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {([...(selectedBuilding?.rooms || []), ...(selectedBuilding?.roomPolygons ? Object.keys(selectedBuilding.roomPolygons) : [])].filter(Boolean).reduce((acc, r) => { if (!acc.includes(r)) acc.push(r); return acc; }, [])).map((room, i) => {
                    const active = selectedRoom === room;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[styles.roomChip, active ? { backgroundColor: '#dbffe3', borderWidth: 1, borderColor: '#1faa59' } : {}]}
                        onPress={() => setSelectedRoom(active ? null : room)}
                      >
                        <Text style={{ color: '#333' }}>{room}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Action buttons intentionally removed */}
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setFloorPlanModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );

  return sanitizeElement(__rawVisitorMapTree);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.warn('VisitorMap ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function VisitorMap(props) {
  return (
    <ErrorBoundary>
      <VisitorMapInner {...props} />
    </ErrorBoundary>
  );
}

// styles
const styles = StyleSheet.create({
  /* Container & header */
  container: { flex: 1, backgroundColor: "#f4f7f9" },
  header: { backgroundColor: green, paddingTop: 55, paddingBottom: 25, paddingHorizontal: 20, borderBottomLeftRadius: 25, borderBottomRightRadius: 25 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "white", fontSize: 20, fontWeight: "700" },
  headerSubtitle: { color: "#ddffdd", marginTop: 4, marginBottom: 15 },

  /* Search */
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "white", paddingHorizontal: 12, borderRadius: 12, height: 40 },
  searchInput: { marginLeft: 8, flex: 1 },
  searchDropdown: { marginTop: 8, backgroundColor: 'white', marginHorizontal: -2, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderBottomColor: 'rgba(0,0,0,0.04)', borderBottomWidth: 1 },
  suggestionText: { fontSize: 14, fontWeight: '700', color: '#222' },
  suggestionSub: { fontSize: 12, color: '#666', marginTop: 2 },
  suggestionEmpty: { padding: 12, alignItems: 'center', justifyContent: 'center' },

  /* Map card */
  mapCard: { marginTop: 20, marginHorizontal: 20, height: Dimensions.get('window').height * 0.9, backgroundColor: lightGreen, borderRadius: 20, padding: 10, overflow: "hidden" },
  mapHint: { position: "absolute", bottom: 10, left: 10, fontSize: 12 },

  /* Building & gate wrappers */
  buildingWrapper: { position: "absolute" },
  blockTouch: { position: "absolute", justifyContent: "flex-end", alignItems: "center", paddingBottom: 6 },

  /* 3D shadow */
  buildingDioramaShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 10 },

  /* Name bubble */
  nameBubble: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, minWidth: 56, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
  nameBubbleText: { fontSize: 12, fontWeight: "700" },

  /* Gate */
  gateTouch: { position: "absolute", alignItems: "center", minWidth: 72, minHeight: 72, paddingHorizontal: 6 },
  gateLabel: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(42,125,255,0.95)", alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8 },
  gateLabelText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  /* Sections */
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 25, marginLeft: 20 },
  itemCard: { backgroundColor: "#fff", padding: 12, borderRadius: 10, marginHorizontal: 20, marginTop: 10 },
  itemTitle: { fontSize: 16, fontWeight: "700" },
  itemSub: { color: "#555", fontSize: 12 },

  /* Modal */
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalCard: { width: "85%", maxWidth: 380, backgroundColor: "white", borderRadius: 20, overflow: "hidden", elevation: 10 },
  modalHeader: { backgroundColor: "#1faa59", paddingVertical: 12, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  modalHeaderText: { color: "white", fontSize: 20, fontWeight: "700" },
  modalRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  modalInfo: { fontSize: 15, color: "#333" },
  modalRoomsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6, marginTop: 10, color: "#2e7d32" },
  modalRoomItem: { marginLeft: 10, fontSize: 14, color: "#555", marginBottom: 4 },
  closeBtn: { backgroundColor: "#1faa59", padding: 15, alignItems: "center" },
  closeBtnText: { color: "white", fontSize: 17, fontWeight: "600" },

  /* Buttons & chips */
  stopChip: { backgroundColor: green, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24, marginRight: 8, flexDirection: "row", alignItems: "center" },
  startBtn: { backgroundColor: green, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  clearBtn: { backgroundColor: "#555", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  centerBtn: { backgroundColor: "#2a7dff", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },

  /* mode button */
  modeBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 6 },
  modeBtnText: { color: "white", textTransform: "capitalize", fontSize: 12 },

  /* explicit mode toggle */
  modeToggleContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", padding: 4, borderRadius: 12 },
  modeToggleButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  modeToggleActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  modeToggleText: { color: "white", fontSize: 12, textTransform: "capitalize" },

  

  vignette: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "transparent", shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 40 },

  /* pulsing walker */
  pulseRing: { position: "absolute", width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(31,150,70,0.12)", borderWidth: 1, borderColor: "rgba(31,150,70,0.18)" },
  pulseDot: { width: 14, height: 14, borderRadius: 8, backgroundColor: "#1faa59", elevation: 8 },
  pulseDotDiorama: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 6 },
  youPulseRing: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(26,150,80,0.12)", borderWidth: 1, borderColor: "rgba(26,150,80,0.16)" },
  youDot: { width: 12, height: 12, borderRadius: 8, backgroundColor: "#1faa59", borderWidth: 2, borderColor: "#fff" },

  

  /* legend */
  legendContainer: { position: "absolute", right: 12, top: 12, backgroundColor: "rgba(255,255,255,0.94)", padding: 8, borderRadius: 10, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  legendSwatch: { width: 16, height: 12, borderRadius: 3, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.06)" },
  legendLabel: { fontSize: 12, color: "#333" },
  scaleBar: { width: 36, height: 6, backgroundColor: "#333", borderRadius: 4, opacity: 0.9 },

  filterChip: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  filterOn: { backgroundColor: '#1faa59', borderColor: 'rgba(0,0,0,0.06)' },
  filterOff: { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.06)' },
  filterText: { fontSize: 12, color: '#222' },

  roomChip: { backgroundColor: "#f1f1f1", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 6, marginBottom: 6 },
});
