
// VisitorMap.js — Version C: Google-Maps-accurate focal pinch + momentum + clamping
import React, { useContext, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Image,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { BuildingsContext } from "./BuildingsContext";
import Svg, { Polyline, Circle, Path, G, Rect, Polygon } from "react-native-svg";
import { PinchGestureHandler, State as GHState } from "react-native-gesture-handler";

const green = "#1faa59";
const lightGreen = "#dbffe3";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
// Visitor modal card is ~85% width with maxWidth 380 (see styles below),
// compute inner content width (subtract modal padding) so carousel children
// can use a fixed pixel width and avoid collapsing to a narrow column.
const VISITOR_MODAL_CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 380);
const VISITOR_MODAL_INNER = Math.round(VISITOR_MODAL_CARD_WIDTH - 40); // modal padding 20 on both sides
const MAP_WIDTH = SCREEN_WIDTH * 1.8;
const MAP_HEIGHT = 500;

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

export default function VisitorMap({ navigation }) {
  const { buildings } = useContext(BuildingsContext);
  const [search, setSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [localBuildings, setLocalBuildings] = useState([]);

  // Floor plan modal visible state (we use this for list -> floor plan modal)
  const [floorPlanModalVisible, setFloorPlanModalVisible] = useState(false);

  const [mode, setMode] = useState("normal");
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
    }
  };

  const initialDistanceRef = useRef(null);
  const initialScaleRef = useRef(1);
  const lastPan = useRef({ x: 0, y: 0 });

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

  const mapContainerRef = useRef(null);
  const [mapLayout, setMapLayout] = useState(null);
  const pinchCenterRef = useRef(null);

  // for double-tap
  const lastTapRef = useRef(0);

  // route + animation
  const [routeStops, setRouteStops] = useState([]);
  const [routePoints, setRoutePoints] = useState([]);
  const animProgress = useRef(new Animated.Value(0)).current;
  const [walkerPos, setWalkerPos] = useState(null);
  const animRef = useRef(null);

  // load buildings/gates (backcompat)
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
  }, [buildings]);

  const filtered = localBuildings.filter((b) => (b.name || "").toLowerCase().includes((search || "").toLowerCase()));
  const calculateWalkingTime = (steps) => Math.ceil((Number(steps) || 0) / 80);
  const getCenter = (b) => ({ x: (Number(b.x) || 0) + 35, y: (Number(b.y) || 0) + 35 });
  const findPrimaryGate = () => localBuildings.find((b) => b.kind === "gate" && b.isMainGate) || localBuildings.find((b) => b.kind === "gate");

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
  const polylinePointsString = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");
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
      onStartShouldSetPanResponder: () => true,
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
          // after decay finished, clamp into bounds with spring
          const finalX = (typeof pan.x.__getValue === "function" ? pan.x.__getValue() : pan.x._value);
          const finalY = (typeof pan.y.__getValue === "function" ? pan.y.__getValue() : pan.y._value);

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

  // building 3D block rendering (returns view only — touch handled outside)
  const render3DBlock = (b) => {
    const baseColor = b.color || TYPE_PRESETS[b.type || "general"] || TYPE_PRESETS.general;
    const front = darken(baseColor, 0.10);
    const side = darken(baseColor, 0.18);
    const top = lighten(baseColor, 0.10);
    const W = 64, H = 64, roofHeight = 12, sideOffset = 12;
    const rgb = hexToRgb(baseColor || "#ffffff");
    const luminance =
      (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const fg = luminance < 0.65 ? "#0d0e0dff" : "#222222";


    return (
      <View key={`block-${b.id}`} style={[{ width: W + sideOffset, height: H + roofHeight + sideOffset, justifyContent: "flex-end", alignItems: "center" }]}>
        <Svg width={W + sideOffset + 4} height={H + roofHeight + sideOffset + 4}>
          <G x={2} y={2}>
            <Polygon points={`${W},${roofHeight} ${W + sideOffset},${roofHeight + sideOffset} ${W + sideOffset},${H + roofHeight + sideOffset} ${W},${H + roofHeight}`} fill={side} />
            <Polygon points={`0,${roofHeight} ${sideOffset},0 ${W + sideOffset},0 ${W},${roofHeight}`} fill={top} />
            <Polygon points={`0,${roofHeight} ${W},${roofHeight} ${W},${H + roofHeight} 0,${H + roofHeight}`} fill={front} />
            {Array.from({ length: 3 }).map((_, row) => Array.from({ length: 2 }).map((__, col) => {
              const wx = 10 + col * 26;
              const wy = roofHeight + 10 + row * 18;
              return <Rect key={`${row}-${col}`} x={wx} y={wy} width={12} height={10} rx={2} fill={lighten(baseColor, 0.6)} />;
            }))}
            <Path d={`M ${W - 18},${6} L ${W - 18},${-6}`} stroke={darken(baseColor, 0.4)} strokeWidth={2} />
            <Polygon points={`${W - 18},-6 ${W - 6},-2 ${W - 18},2`} fill={darken(baseColor, 0.2)} />
          </G>
        </Svg>

        {/* moved the name bubble ABOVE the block by using absolute top */}
        <View style={[styles.nameBubble, { backgroundColor: "rgba(255,255,255,0.95)", position: "absolute", top: -36, marginTop: 0 }]}>
          <Text numberOfLines={1} style={[styles.nameBubbleText, { color: fg }]}>{(b.name || "").length > 14 ? (b.name || "").slice(0, 13) + "…" : (b.name || "")}</Text>
        </View>
      </View>
    );
  };

  // mode toggle
  const cycleMode = () => setMode((m) => (m === "normal" ? "diorama" : m === "diorama" ? "pixel" : "normal"));

  // handle routePoints when routeStops change
  useEffect(() => {
    const pts = buildFullRoutePoints(routeStops);
    setRoutePoints(pts);
    animProgress.setValue(0);
    setWalkerPos(pts.length > 0 ? pts[0] : null);
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
    const target = { x: (Number(b.x) || 0) + 35, y: (Number(b.y) || 0) + 35 };
    const screenCenterX = SCREEN_WIDTH / 2;
    const screenCenterY = (mapLayout ? mapLayout.y : 165) + (mapLayout ? mapLayout.height / 2 : 165);
    const toX = screenCenterX - target.x * s;
    const toY = screenCenterY - target.y * s;
    const minX = SCREEN_WIDTH - MAP_WIDTH * s; const maxX = 0;
    const minY = Math.min(SCREEN_HEIGHT - MAP_HEIGHT * s, 0); const maxY = 0;
    const clampedX = Math.min(Math.max(toX, minX), maxX); const clampedY = Math.min(Math.max(toY, minY), maxY);
    Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, stiffness: 180, damping: 20, useNativeDriver: true }).start(() => lastPan.current = { x: clampedX, y: clampedY });
  };

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

  // Double-tap handler overlay
  const onMapTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      // double-tap: fit all
      fitAll();
    }
    lastTapRef.current = now;
  };

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color="white" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Campus Map</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={cycleMode} style={styles.modeBtn}><Ionicons name={mode === "normal" ? "cube" : mode === "diorama" ? "contrast" : "grid"} size={18} color="white" /><Text style={styles.modeBtnText}>{mode}</Text></TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>Pinch to zoom • Tap building to open details</Text>
        <View style={styles.searchBar}><Ionicons name="search" size={18} color="#666" /><TextInput placeholder="Search buildings, rooms, dept…" style={styles.searchInput} value={search} onChangeText={setSearch} /></View>
      </View>

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
          <TouchableWithoutFeedback onPress={onMapTap}>
  <PinchGestureHandler
    ref={pinchRef}
    onGestureEvent={onPinchEvent}
    onHandlerStateChange={onPinchStateChange}
  >
  <Animated.View
    {...panResponder.panHandlers}
    style={{
      width: MAP_WIDTH,  // FULL MAP WIDTH ALWAYS
      height: MAP_HEIGHT,
      transform: animatedTransforms(),
    }}
  >

              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
                <G opacity={1}>{renderCampusPaths()}</G>

                {/* ---------- START: INSERTED CUSTOM ROADS ---------- */}
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
                {/* ---------- END: INSERTED CUSTOM ROADS ---------- */}

                {routePoints.length >= 2 && (
                  <>
                    <Polyline points={polylinePointsString(routePoints)} fill="none" stroke={green} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
                    <Polyline points={polylinePointsString(routePoints)} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                    {routePoints.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={6} fill="#fff" stroke={green} strokeWidth={3} />)}
                  </>
                )}
              </Svg>

              <Text style={styles.mapHint}>Tap a building to add stops • Gates open details only</Text>

              {/* gates first */}
              {filtered.filter((it) => it.kind === "gate").map((g) => renderGate(g))}

              {/* buildings - use wrapper (not nested Touchable) */}
              {filtered.filter((it) => it.kind !== "gate").map((b) => (
                <View key={`wrap-${b.id}`} style={[styles.buildingWrapper, { left: Number(b.x) || 0, top: Number(b.y) || 0 }]}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => { setSelectedBuilding(b); }} style={{ alignItems: "center" }}>
                    {render3DBlock(b)}
                  </TouchableOpacity>
                </View>
              ))}

              {walkerPos && (
                <View pointerEvents="none" style={[{ position: "absolute", left: walkerPos.x - 8, top: walkerPos.y - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: "#074", elevation: 6 }, mode === "diorama" ? { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 6 } : {}]} />
              )}

              {mode === "pixel" && (
                <Svg width={MAP_WIDTH} height={MAP_HEIGHT} style={StyleSheet.absoluteFill}>
                  {Array.from({ length: Math.ceil(MAP_HEIGHT / 12) }).map((_, r) =>
                    Array.from({ length: Math.ceil(MAP_WIDTH / 12) }).map((__, c) => (
                      <Rect key={`${r}-${c}`} x={c * 12} y={r * 12} width={12} height={12} fill="rgba(0,0,0,0.04)" />
                    ))
                  )}
                </Svg>
              )}

              {mode === "diorama" && <View pointerEvents="none" style={styles.vignette} />}
            </Animated.View>
  </PinchGestureHandler>
          </TouchableWithoutFeedback>
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
            {routeStops.map((s, idx) => <Text key={s.id} style={{ marginTop: 6 }}>{`${idx + 1}. ${idx === 0 ? "Start at " : "Arrive at "} ${s.name}`}</Text>)}
          </View>
        </View>

        <Text style={styles.sectionTitle}>All Campus Items</Text>
        {filtered.map((it) => (
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
              <Ionicons name={selectedBuilding?.kind === "gate" ? "md-enter" : "business"} size={26} color="white" />
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
              {selectedBuilding?.photo || selectedBuilding?.floorPlan ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center' }}
                >
                  {selectedBuilding?.photo ? (
                    <View style={{ width: VISITOR_MODAL_INNER }}>
                      <Image source={{ uri: selectedBuilding.photo }} style={{ width: VISITOR_MODAL_INNER, height: 180, borderRadius: 12 }} resizeMode="cover" />
                    </View>
                  ) : null}

                  {selectedBuilding?.floorPlan ? (
                    <View style={{ width: VISITOR_MODAL_INNER }}>
                      <Image source={{ uri: selectedBuilding.floorPlan }} style={{ width: VISITOR_MODAL_INNER, height: 180, borderRadius: 12 }} resizeMode="contain" />
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ textAlign: 'center', marginTop: 20 }}>No exterior photo or floor plan uploaded.</Text>
              )}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setFloorPlanModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
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

  /* Map card */
  mapCard: { marginTop: 20, marginHorizontal: 20, height: SCREEN_HEIGHT * 0.9, backgroundColor: lightGreen, borderRadius: 20, padding: 10, overflow: "hidden" },
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
  gateTouch: { position: "absolute", alignItems: "center", width: 72, height: 72 },
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

  vignette: { position: "absolute", left: 0, top: 0, width: MAP_WIDTH, height: MAP_HEIGHT, backgroundColor: "transparent", shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 40 },

  roomChip: { backgroundColor: "#f1f1f1", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 6, marginBottom: 6 },
});
