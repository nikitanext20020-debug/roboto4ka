import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Download, Type, Grid3X3, Crop, RotateCcw, Minus, Plus, Move, ImagePlus, Image as ImageIcon, Shapes, Smile, Sparkles, Wand2, Eraser, Maximize2, Palette, Replace, Layers, Sun } from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingOverlay from "../components/LoadingOverlay";
import { downloadBlob } from "../lib/image";
import { uploadImage, buildAiUrl, waitForReady, type AiOp } from "../lib/cloudinary";
import { saveDraft, logHistory, toggleFavorite, isFavorite, listFavorites, listDrafts, type Favorite, type Draft } from "../lib/autosave";
import { useAppState } from "../lib/appState";

type Tool = "select" | "mosaic" | "text" | "crop" | "photo" | "shape" | "sticker" | "ai";

type Overlay = {
  id: number;
  type: "text" | "photo" | "shape" | "sticker";
  x: number; y: number; size: number;
  // text
  text?: string; color?: string; font?: string; textStyle?: string;
  // photo
  imgSrc?: string;
  // shape
  shape?: string; shapeColor?: string;
  // sticker
  emoji?: string;
};

const FONTS = [
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Montserrat", value: "'Montserrat', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Bebas Neue", value: "'Bebas Neue', sans-serif" },
  { label: "Oswald", value: "'Oswald', sans-serif" },
  { label: "Anton", value: "'Anton', sans-serif" },
  { label: "Pacifico", value: "'Pacifico', cursive" },
  { label: "Caveat", value: "'Caveat', cursive" },
  { label: "Dancing Script", value: "'Dancing Script', cursive" },
  { label: "Orbitron", value: "'Orbitron', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Raleway", value: "'Raleway', sans-serif" },
  { label: "Rubik", value: "'Rubik', sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Comic Sans", value: "'Comic Sans MS', cursive" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const TEXT_STYLES = [
  { id: "normal", label: "Обычный" },
  { id: "shadow", label: "Тень" },
  { id: "glow", label: "Glow" },
  { id: "outline", label: "Обводка" },
  { id: "neon", label: "Неон" },
  { id: "italic", label: "Курсив" },
  { id: "gradient", label: "Градиент" },
  { id: "uppercase", label: "ПРОПИСНЫЕ" },
  { id: "shadow3d", label: "3D" },
  { id: "fire", label: "Огонь" },
];

const SHAPES = [
  { id: "circle", label: "Круг", svg: (c: string) => `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" fill="${c}"/></svg>` },
  { id: "triangle", label: "Треугольник", svg: (c: string) => `<svg viewBox="0 0 80 80"><polygon points="40,6 76,74 4,74" fill="${c}"/></svg>` },
  { id: "star", label: "Звезда", svg: (c: string) => `<svg viewBox="0 0 80 80"><polygon points="40,6 50,30 76,30 55,46 63,72 40,56 17,72 25,46 4,30 30,30" fill="${c}"/></svg>` },
  { id: "square", label: "Квадрат", svg: (c: string) => `<svg viewBox="0 0 80 80"><rect x="8" y="8" width="64" height="64" rx="6" fill="${c}"/></svg>` },
  { id: "heart", label: "Сердце", svg: (c: string) => `<svg viewBox="0 0 80 80"><path d="M40 70 C20 50 5 35 5 22 5 12 15 5 25 5 32 5 37 8 40 14 43 8 48 5 55 5 65 5 75 12 75 22 75 35 60 50 40 70Z" fill="${c}"/></svg>` },
];

const STICKERS = ["😀","😂","🥰","😎","🤔","👍","❤️","🔥","⭐","💯","🎉","👀","💀","🙌","✨","🚀","💪","🎯","🏆","🌟"];

let nextId = 1;

export default function MediaPage({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [loading, setLoading] = useState<string | null>(null);

  // ===== Undo / Redo =====
  // (определяется ниже, после всех useState)

  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);

  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // ===== Undo / Redo (после всех useState) =====
  type Snapshot = { baseDataUrl: string; overlays: Overlay[] };
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImg) return;
    undoStackRef.current.push({
      baseDataUrl: canvas.toDataURL("image/png"),
      overlays: JSON.parse(JSON.stringify(overlaysRef.current)),
    });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    redoStackRef.current.push({
      baseDataUrl: canvas.toDataURL("image/png"),
      overlays: JSON.parse(JSON.stringify(overlaysRef.current)),
    });
    const snap = undoStackRef.current.pop()!;
    const img = new Image();
    img.onload = () => { setBaseImg(img); setOverlays(snap.overlays); };
    img.src = snap.baseDataUrl;
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStackRef.current.push({
      baseDataUrl: canvas.toDataURL("image/png"),
      overlays: JSON.parse(JSON.stringify(overlaysRef.current)),
    });
    const snap = redoStackRef.current.pop()!;
    const img = new Image();
    img.onload = () => { setBaseImg(img); setOverlays(snap.overlays); };
    img.src = snap.baseDataUrl;
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // Ctrl+Z / Ctrl+Y / Ctrl+T
  const [transformMode, setTransformMode] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Игнорируем если в input/textarea/contentEditable
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        if (selectedId !== null) setTransformMode(true);
      }
      if (e.key === "Escape") { setTransformMode(false); setSelectedId(null); }
      if (e.key === "Enter" && transformMode) setTransformMode(false);
      if (e.key === "Delete" && selectedId !== null && !transformMode) {
        saveSnapshot();
        setOverlays((p) => p.filter((o) => o.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, transformMode]);

  // Text settings
  const [textSize, setTextSize] = useState(32);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textFont, setTextFont] = useState(FONTS[0].value);
  const [textStyle, setTextStyle] = useState("normal");

  // Shape settings
  const [shapeType, setShapeType] = useState("circle");
  const [shapeColor, setShapeColor] = useState("#a78bfa");

  // Crop
  const [cropStart, setCropStart] = useState<{x:number;y:number}|null>(null);
  const [cropEnd, setCropEnd] = useState<{x:number;y:number}|null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // Export
  const [quality, setQuality] = useState(0.82);
  const [format, setFormat] = useState<"image/jpeg"|"image/webp"|"image/png">("image/jpeg");
  const [estimatedSize, setEstimatedSize] = useState("");

  // AI state
  const [aiUploadedId, setAiUploadedId] = useState<string | null>(null);
  const [aiResultUrl, setAiResultUrl] = useState<string | null>(null);
  const [aiPromptFrom, setAiPromptFrom] = useState("");
  const [aiPromptTo, setAiPromptTo] = useState("");
  const [aiAspect, setAiAspect] = useState("16:9");
  const [aiBgPrompt, setAiBgPrompt] = useState("");
  const [aiRecolorObj, setAiRecolorObj] = useState("");
  const [aiRecolorTo, setAiRecolorTo] = useState("#7c5cff");

  // Estimate size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImg) { setEstimatedSize(""); return; }
    const timer = setTimeout(() => {
      canvas.toBlob((blob) => {
        if (blob) {
          const kb = blob.size / 1024;
          setEstimatedSize(kb > 1024 ? `${(kb/1024).toFixed(1)} МБ` : `${kb.toFixed(0)} КБ`);
        }
      }, format, quality);
    }, 200);
    return () => clearTimeout(timer);
  }, [quality, format, baseImg]);

  // Load image
  const onPick = () => inputRef.current?.click();
  const onFile = (f?: File) => {
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    const image = new Image();
    image.onload = () => { setBaseImg(image); setOverlays([]); setCropStart(null); setCropEnd(null); };
    image.src = url;
  };

  // Подхват файла из "Файлов" / "Избранного"
  const { pendingOpen, setPendingOpen } = useAppState();
  useEffect(() => {
    if (pendingOpen?.source === "photo" && pendingOpen.data) {
      // dataURL → File
      fetch(pendingOpen.data).then((r) => r.blob()).then((blob) => {
        const f = new File([blob], pendingOpen.name, { type: blob.type || "image/jpeg" });
        onFile(f);
        setPendingOpen(null);
      });
    }
  }, [pendingOpen, setPendingOpen]);

  // Избранное
  const [favVersion, setFavVersion] = useState(0);
  const isInFavorites = file ? isFavorite("photo", file.name) : false;
  const onToggleFav = () => {
    if (!file || !canvasRef.current) return;
    const preview = canvasRef.current.toDataURL("image/jpeg", 0.5);
    const data = canvasRef.current.toDataURL("image/jpeg", 0.85);
    toggleFavorite({ source: "photo", name: file.name, preview, data });
    setFavVersion((v) => v + 1);
  };

  // ===== Ctrl+V paste из проводника =====
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      // Игнорируем если фокус на input/textarea/contentEditable
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (
        ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.isContentEditable
      )) return;

      // 1) Сначала пробуем clipboardData.files (Windows Explorer копирует сюда файлы)
      const files = Array.from(e.clipboardData.files || []);
      const imgFile = files.find((f) => f.type.startsWith("image/"));
      if (imgFile) {
        const name = imgFile.name || `pasted-${Date.now()}.${imgFile.type.split("/")[1] || "png"}`;
        const f = new File([imgFile], name, { type: imgFile.type });
        if (baseImg) {
          const url = URL.createObjectURL(f);
          const w = baseImg.width;
          const h = baseImg.height;
          setOverlays(p => [...p, {
            id: nextId++, type: "photo",
            x: w * 0.1, y: h * 0.1,
            size: Math.round(w * 0.4),
            imgSrc: url,
          }]);
        } else {
          onFile(f);
        }
        e.preventDefault();
        return;
      }

      // 2) Иначе пробуем items (буфер из браузера, Win+Shift+S и т.д.)
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const name = `pasted-${Date.now()}.${blob.type.split("/")[1] || "png"}`;
          const f = new File([blob], name, { type: blob.type });
          if (baseImg) {
            const url = URL.createObjectURL(f);
            const w = baseImg.width;
            const h = baseImg.height;
            setOverlays(p => [...p, {
              id: nextId++, type: "photo",
              x: w * 0.1, y: h * 0.1,
              size: Math.round(w * 0.4),
              imgSrc: url,
            }]);
          } else {
            onFile(f);
          }
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [baseImg]);

  // ===== Picker из библиотеки =====
  const [showLibrary, setShowLibrary] = useState<"base" | "overlay" | null>(null);
  const onPickFromLibrary = (data: string, name: string, asOverlay: boolean) => {
    if (asOverlay && baseImg) {
      const w = baseImg.width;
      const h = baseImg.height;
      setOverlays(p => [...p, {
        id: nextId++, type: "photo",
        x: w * 0.1, y: h * 0.1,
        size: Math.round(w * 0.4),
        imgSrc: data,
      }]);
    } else {
      // Загрузить как базовое фото
      fetch(data).then(r => r.blob()).then((blob) => {
        const f = new File([blob], name, { type: blob.type || "image/jpeg" });
        onFile(f);
      });
    }
    setShowLibrary(null);
  };

  // Render canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImg) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = baseImg.width; canvas.height = baseImg.height;
    ctx.drawImage(baseImg, 0, 0);
    if (cropStart && cropEnd && tool === "crop") {
      ctx.strokeStyle = "rgba(167,139,250,0.8)"; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
      const x = Math.min(cropStart.x, cropEnd.x), y = Math.min(cropStart.y, cropEnd.y);
      const w = Math.abs(cropEnd.x - cropStart.x), h = Math.abs(cropEnd.y - cropStart.y);
      ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(4,6,24,0.5)";
      ctx.fillRect(0,0,canvas.width,y); ctx.fillRect(0,y,x,h);
      ctx.fillRect(x+w,y,canvas.width-x-w,h); ctx.fillRect(0,y+h,canvas.width,canvas.height-y-h);
    }
  }, [baseImg, cropStart, cropEnd, tool]);

  useEffect(() => { render(); }, [render]);

  // ---- Автосохранение черновика (каждые 2 сек после изменений) ----
  useEffect(() => {
    if (!baseImg || !file) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const t = setTimeout(() => {
      try {
        const w = 320;
        const h = Math.round((canvas.height / canvas.width) * w) || 200;
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const ctx = off.getContext("2d")!;
        ctx.drawImage(canvas, 0, 0, w, h);
        const preview = off.toDataURL("image/jpeg", 0.7);
        const data = canvas.toDataURL("image/jpeg", 0.85);
        saveDraft({ source: "photo", name: file.name, preview, data });
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [baseImg, file, overlays]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const bakeCanvas = () => {
    saveSnapshot(); // undo point
    const canvas = canvasRef.current; if (!canvas) return;
    const newImg = new Image();
    newImg.onload = () => setBaseImg(newImg);
    newImg.src = canvas.toDataURL();
  };

  // Mosaic
  const applyMosaic = (x: number, y: number) => {
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!;
    const size = brushSize; const px = 8;
    const sx = Math.max(0, Math.floor(x-size/2)), sy = Math.max(0, Math.floor(y-size/2));
    const ex = Math.min(canvas.width, sx+size), ey = Math.min(canvas.height, sy+size);
    for (let bx=sx; bx<ex; bx+=px) for (let by=sy; by<ey; by+=px) {
      const w=Math.min(px,ex-bx), h=Math.min(px,ey-by);
      const data = ctx.getImageData(bx,by,w,h).data;
      let r=0,g=0,b=0,count=0;
      for (let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];count++;}
      ctx.fillStyle=`rgb(${Math.round(r/count)},${Math.round(g/count)},${Math.round(b/count)})`;
      ctx.fillRect(bx,by,w,h);
    }
  };

  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "mosaic") { setIsDrawing(true); applyMosaic(pos.x, pos.y); }
    else if (tool === "crop") { setCropStart(pos); setCropEnd(pos); setIsCropping(true); }
    else {
      // Клик по пустому месту canvas → снять выделение
      setSelectedId(null);
      setTransformMode(false);
    }
  };
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "mosaic" && isDrawing) applyMosaic(pos.x, pos.y);
    else if (tool === "crop" && isCropping) setCropEnd(pos);
  };
  const onCanvasUp = () => {
    if (tool === "mosaic" && isDrawing) bakeCanvas();
    setIsDrawing(false); setIsCropping(false);
  };

  // Add overlays — размеры пропорциональны canvas (10-20% ширины)
  const cw = baseImg?.width ?? 800;
  const ch = baseImg?.height ?? 600;

  const addText = () => { saveSnapshot(); setOverlays(p => [...p, {
    id: nextId++, type: "text",
    x: cw * 0.1, y: ch * 0.1,
    size: Math.round(cw * 0.06),
    text: "Текст", color: textColor, font: textFont, textStyle,
  }]); };
  const addPhoto = (f: File) => {
    saveSnapshot();
    const url = URL.createObjectURL(f);
    setOverlays(p => [...p, {
      id: nextId++, type: "photo",
      x: cw * 0.1, y: ch * 0.1,
      size: Math.round(cw * 0.4),
      imgSrc: url,
    }]);
  };
  const addShape = (s: string) => { saveSnapshot(); setOverlays(p => [...p, {
    id: nextId++, type: "shape",
    x: cw * 0.15, y: ch * 0.15,
    size: Math.round(cw * 0.2),
    shape: s, shapeColor,
  }]); };
  const addSticker = (emoji: string) => { saveSnapshot(); setOverlays(p => [...p, {
    id: nextId++, type: "sticker",
    x: cw * 0.2, y: ch * 0.2,
    size: Math.round(cw * 0.15),
    emoji,
  }]); };

  // Crop
  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d")!;
    render();
    const x=Math.min(cropStart.x,cropEnd.x), y=Math.min(cropStart.y,cropEnd.y);
    const w=Math.abs(cropEnd.x-cropStart.x), h=Math.abs(cropEnd.y-cropStart.y);
    if (w<10||h<10) return;
    const imageData = ctx.getImageData(x,y,w,h);
    canvas.width=w; canvas.height=h; ctx.putImageData(imageData,0,0);
    const newImg = new Image();
    newImg.onload = () => { setBaseImg(newImg); setCropStart(null); setCropEnd(null); setTool("select"); };
    newImg.src = canvas.toDataURL();
  };

  const reset = () => {
    if (!file) return;
    setOverlays([]); setCropStart(null); setCropEnd(null);
    const url = URL.createObjectURL(file);
    const image = new Image(); image.onload = () => setBaseImg(image); image.src = url;
  };

  // Save
  const onSave = () => {
    const canvas = canvasRef.current; if (!canvas || !file || !baseImg) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = baseImg.width; canvas.height = baseImg.height;
    ctx.drawImage(baseImg, 0, 0);

    // Координаты overlay уже в canvas-пикселях, никакого scale не надо
    for (const o of overlays) {
      if (o.type === "text" && o.text) {
        const ts = o.textStyle ?? "shadow";
        const color = o.color || "#fff";
        const text = ts === "uppercase" ? o.text.toUpperCase() : o.text;
        const italic = ts === "italic" ? "italic " : "";
        ctx.font = `${italic}bold ${o.size}px ${o.font}`;
        ctx.fillStyle = color;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Обводка
        if (ts === "outline") {
          ctx.lineWidth = o.size * 0.06;
          ctx.strokeStyle = "#000";
          ctx.strokeText(text, o.x, o.y + o.size);
        }
        // Тень / свечения
        if (ts === "shadow") {
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
        } else if (ts === "glow") {
          ctx.shadowColor = color;
          ctx.shadowBlur = o.size * 0.6;
        } else if (ts === "neon") {
          ctx.fillStyle = "#fff";
          ctx.shadowColor = color;
          ctx.shadowBlur = o.size * 1.2;
        } else if (ts === "shadow3d") {
          // Рисуем "лесенку" самим текстом, не shadow
          for (let i = 1; i <= 5; i++) {
            ctx.fillStyle = color;
            ctx.fillText(text, o.x + i, o.y + o.size + i);
          }
          ctx.fillStyle = color;
        } else if (ts === "fire") {
          ctx.fillStyle = "#fff";
          ctx.shadowColor = "#FF3300";
          ctx.shadowBlur = o.size * 0.8;
          ctx.shadowOffsetY = -4;
        } else if (ts === "gradient") {
          const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.size * 4, o.y);
          grad.addColorStop(0, "#ff00cc");
          grad.addColorStop(1, "#3333ff");
          ctx.fillStyle = grad;
        } else if (ts === "uppercase") {
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 6;
          // letterSpacing: рисуем буквы по одной
        } else {
          // normal — лёгкая тень для читаемости
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 4;
        }

        if (ts === "uppercase") {
          // Имитируем letter-spacing 2px через построчный рендер
          let x = o.x;
          for (const ch of text) {
            ctx.fillText(ch, x, o.y + o.size);
            x += ctx.measureText(ch).width + 2;
          }
        } else if (ts !== "shadow3d") {
          ctx.fillText(text, o.x, o.y + o.size);
        }
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else if (o.type === "sticker" && o.emoji) {
        ctx.font = `${o.size}px serif`;
        ctx.fillText(o.emoji, o.x, o.y + o.size);
      } else if (o.type === "shape" && o.shape) {
        const shapeDef = SHAPES.find(s => s.id === o.shape);
        if (shapeDef) {
          const svgStr = shapeDef.svg(o.shapeColor || "#a78bfa");
          const img = new Image();
          img.src = "data:image/svg+xml," + encodeURIComponent(svgStr);
          ctx.drawImage(img, o.x, o.y, o.size, o.size);
        }
      } else if (o.type === "photo" && o.imgSrc) {
        const img = new Image();
        img.src = o.imgSrc;
        ctx.drawImage(img, o.x, o.y, o.size, o.size);
      }
    }
    setTimeout(() => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const ext = format.split("/")[1] === "jpeg" ? "jpg" : format.split("/")[1];
        const outName = `${file.name.replace(/\.[^.]+$/,"")}_edited.${ext}`;
        downloadBlob(blob, outName);
        logHistory(`Сохранено: ${outName}`, "Редактор фото");
      }, format, quality);
    }, 100);
  };

  const dragOver = (e: React.DragEvent) => e.preventDefault();
  const drop = (e: React.DragEvent) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); };

  const updateOverlay = (id: number, u: Partial<Overlay>) => setOverlays(p => p.map(o => o.id === id ? {...o,...u} : o));
  const deleteOverlay = (id: number) => setOverlays(p => p.filter(o => o.id !== id));

  const toolsList: {id:Tool;icon:any;label:string}[] = [
    {id:"select",icon:Move,label:"Выбор"},{id:"mosaic",icon:Grid3X3,label:"Мозаика"},
    {id:"text",icon:Type,label:"Текст"},{id:"photo",icon:ImageIcon,label:"Фото"},
    {id:"shape",icon:Shapes,label:"Фигуры"},{id:"sticker",icon:Smile,label:"Стикеры"},
    {id:"crop",icon:Crop,label:"Обрезка"},{id:"ai",icon:Sparkles,label:"AI"},
  ];

  // ===== AI обработка =====
  const ensureAiUpload = async (): Promise<string> => {
    if (aiUploadedId) return aiUploadedId;
    if (!file) throw new Error("Сначала выбери фото");
    setLoading("Загрузка фото в Cloudinary...");
    const res = await uploadImage(file);
    setAiUploadedId(res.publicId);
    return res.publicId;
  };

  const runAi = async (op: AiOp, label: string) => {
    if (!file) { alert("Сначала выбери фото"); return; }
    setAiResultUrl(null);
    try {
      const publicId = await ensureAiUpload();
      setLoading(`${label}... ожидание AI до 60с`);
      const url = buildAiUrl(publicId, op, "jpg");
      const blob = await waitForReady(url);
      const blobUrl = URL.createObjectURL(blob);
      setAiResultUrl(blobUrl);
    } catch (e: any) {
      alert(`${label}: ${e?.message ?? e}`);
    } finally {
      setLoading(null);
    }
  };

  const applyAiAsBase = async () => {
    if (!aiResultUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBaseImg(img);
    img.src = aiResultUrl;
  };

  const downloadAi = async () => {
    if (!aiResultUrl || !file) return;
    const r = await fetch(aiResultUrl);
    const blob = await r.blob();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    downloadBlob(blob, `${baseName}_ai.jpg`);
  };

  // Reset AI when new file picked
  const aiReset = () => { setAiUploadedId(null); setAiResultUrl(null); setAiEditResult(null); };

  // ===== RunFlow AI Edit =====
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [aiEditResult, setAiEditResult] = useState<string | null>(null);

  const onRunflowEdit = async () => {
    if (!file || !aiEditPrompt.trim()) return;
    setAiEditResult(null);
    try {
      setLoading("AI обрабатывает фото...");
      const { editImageWithAI } = await import("../lib/runflow");
      const result = await editImageWithAI(file, aiEditPrompt.trim(), (msg) => setLoading(msg));
      setAiEditResult(result.url);
    } catch (e: any) {
      alert("Ошибка AI: " + (e?.message ?? e));
    } finally {
      setLoading(null);
    }
  };

  const applyAiEditAsBase = () => {
    if (!aiEditResult) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBaseImg(img);
    img.src = aiEditResult;
  };

  const downloadAiEdit = async () => {
    if (!aiEditResult || !file) return;
    try {
      const r = await fetch(aiEditResult);
      const blob = await r.blob();
      const { downloadBlob } = await import("../lib/image");
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}_ai.webp`);
    } catch (e: any) {
      alert("Ошибка скачивания: " + (e?.message ?? e));
    }
  };


  return (
    <div className="space-y-5">
      <LoadingOverlay visible={!!loading} text={loading ?? ""} />
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) addPhoto(e.target.files[0]); e.target.value = ""; }} />

      <PageHeader title="Редактор фото" subtitle="Мозаика, текст, фигуры, стикеры, фото на фото. Всё локально." onBack={onBack}
        right={
          <div className="flex items-center gap-2" data-fav-version={favVersion}>
            {file && (
              <button
                onClick={onToggleFav}
                title={isInFavorites ? "Убрать из избранного" : "В избранное"}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all ${
                  isInFavorites
                    ? "bg-yellow-500/20 border-yellow-400/40 text-yellow-200"
                    : "glass hover:border-yellow-400/60 hover:text-yellow-200"
                }`}
              >
                <Sparkles className={`h-4 w-4 ${isInFavorites ? "fill-current" : ""}`} />
                {isInFavorites ? "В избранном" : "В избранное"}
              </button>
            )}
            <button onClick={onPick} className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm hover:border-violet-400/60 transition-all">
              <Upload className="h-4 w-4 text-violet-200" /> Выбрать файл
            </button>
          </div>
        }
      />

      {/* Toolbar */}
      <section className="rounded-3xl glass p-4 flex flex-wrap items-center gap-2">
        {toolsList.map((t) => {
          const Icon = t.icon; const active = tool === t.id;
          return (
            <button key={t.id} onClick={() => { setTool(t.id); setSelectedId(null); setTransformMode(false); }}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all border ${active ? "bg-gradient-to-r from-violet-600/30 to-indigo-600/15 border-violet-400/50 text-white shadow-[0_0_15px_-5px_rgba(139,92,246,0.5)]" : "border-violet-400/15 text-violet-200/70 hover:border-violet-400/40 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
        <div className="h-6 w-px bg-violet-400/20 mx-1" />
        <button onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)" className="inline-flex items-center gap-1 rounded-xl glass px-2.5 py-2 text-sm hover:border-violet-400/60 disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={redo} disabled={!canRedo} title="Повторить (Ctrl+Y)" className="inline-flex items-center gap-1 rounded-xl glass px-2.5 py-2 text-sm hover:border-violet-400/60 disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5 scale-x-[-1]" /></button>
        <div className="h-6 w-px bg-violet-400/20 mx-1" />
        <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-xl glass px-3 py-2 text-sm hover:border-violet-400/60"><RotateCcw className="h-3.5 w-3.5" /> Сброс</button>
        {tool === "crop" && cropStart && cropEnd && (
          <button onClick={applyCrop} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]"><Crop className="h-3.5 w-3.5" /> Применить</button>
        )}
      </section>

      {/* Tool options */}
      {tool === "mosaic" && (
        <section className="rounded-2xl glass p-4 flex items-center gap-4">
          <span className="text-xs text-violet-200/60">Кисть:</span>
          <Minus className="h-3.5 w-3.5 text-violet-300 cursor-pointer" onClick={() => setBrushSize(Math.max(10, brushSize - 10))} />
          <input type="range" min={10} max={100} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)} className="flex-1 max-w-[200px] accent-violet-500" />
          <Plus className="h-3.5 w-3.5 text-violet-300 cursor-pointer" onClick={() => setBrushSize(Math.min(100, brushSize + 10))} />
          <span className="text-xs text-violet-100 font-mono">{brushSize}px</span>
        </section>
      )}

      {tool === "text" && (
        <section className="rounded-2xl glass p-4 flex flex-wrap items-center gap-4">
          <button onClick={addText} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]"><Plus className="h-3.5 w-3.5" /> Добавить текст</button>
          <select value={textFont} onChange={(e) => setTextFont(e.target.value)} className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1.5 text-sm text-violet-100 focus:outline-none focus:border-violet-400/60">
            {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={textStyle} onChange={(e) => setTextStyle(e.target.value)} className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1.5 text-sm text-violet-100 focus:outline-none focus:border-violet-400/60" title="Стиль текста">
            {TEXT_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input type="number" min={12} max={200} value={textSize} onChange={(e) => setTextSize(+e.target.value)} className="w-16 rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-2 py-1.5 text-sm text-center focus:outline-none focus:border-violet-400/60" />
          <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-8 w-8 rounded-lg border border-violet-400/20 cursor-pointer bg-transparent" />
        </section>
      )}

      {tool === "photo" && (
        <section className="rounded-2xl glass p-4 flex flex-wrap items-center gap-3">
          <button onClick={() => photoInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]">
            <ImagePlus className="h-3.5 w-3.5" /> Добавить с диска
          </button>
          <button onClick={() => setShowLibrary("overlay")} className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm hover:border-violet-400/60 transition-all">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" /> Из библиотеки
          </button>
          <span className="text-xs text-violet-200/50">Или нажми <kbd className="px-1.5 py-0.5 bg-violet-500/20 border border-violet-400/30 rounded text-[10px] font-mono">Ctrl+V</kbd> чтобы вставить картинку из буфера обмена</span>
        </section>
      )}

      {tool === "shape" && (
        <section className="rounded-2xl glass p-4 flex flex-wrap items-center gap-3">
          {SHAPES.map((s) => (
            <button key={s.id} onClick={() => { setShapeType(s.id); addShape(s.id); }}
              className="h-12 w-12 rounded-xl bg-[#0a0c20]/60 border border-violet-400/15 hover:border-violet-400/50 flex items-center justify-center transition-colors"
              title={s.label}
              dangerouslySetInnerHTML={{ __html: s.svg(shapeColor) }}
            />
          ))}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-violet-200/60">Цвет:</span>
            <input type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} className="h-8 w-8 rounded-lg border border-violet-400/20 cursor-pointer bg-transparent" />
          </div>
        </section>
      )}

      {tool === "sticker" && (
        <section className="rounded-2xl glass p-4">
          <div className="flex flex-wrap gap-2">
            {STICKERS.map((e) => (
              <button key={e} onClick={() => addSticker(e)} className="h-11 w-11 rounded-xl bg-[#0a0c20]/60 border border-violet-400/15 hover:border-violet-400/50 flex items-center justify-center text-2xl transition-colors">{e}</button>
            ))}
          </div>
        </section>
      )}

      {tool === "ai" && (
        <section className="rounded-3xl glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-fuchsia-300" />
            <h3 className="text-sm font-semibold">Редактор фото ИИ</h3>
            <span className="ml-auto text-[10px] text-violet-200/40">Google Nano Banana 2 · RunFlow</span>
          </div>

          {/* RunFlow AI Edit */}
          <div className="mb-6 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-4">
            <p className="text-xs text-violet-200/70 mb-3">
              Опиши что хочешь сделать с фото на английском. AI перерисует, добавит, уберёт, изменит стиль.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiEditPrompt}
                onChange={(e) => setAiEditPrompt(e.target.value)}
                placeholder="Transform into anime style / Remove background / Add sunset sky..."
                className="flex-1 rounded-xl bg-[#0a0c20]/70 border border-violet-400/15 px-4 py-2.5 text-sm focus:outline-none focus:border-fuchsia-400/60"
              />
              <button
                onClick={onRunflowEdit}
                disabled={!file || !aiEditPrompt.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(219,39,119,0.7)] disabled:opacity-40"
              >
                <Wand2 className="h-4 w-4" /> Сгенерировать
              </button>
            </div>
            {aiEditResult && (
              <div className="mt-3 rounded-xl border border-fuchsia-400/20 bg-[#0a0c20]/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs text-emerald-300">Результат готов</span>
                  <button onClick={applyAiEditAsBase} className="ml-auto rounded-lg glass px-3 py-1.5 text-xs hover:border-fuchsia-400/60">
                    Применить к холсту
                  </button>
                  <button onClick={downloadAiEdit} className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-600 px-3 py-1.5 text-xs font-semibold">
                    <Download className="h-3 w-3 inline mr-1" /> Скачать
                  </button>
                </div>
                <img src={aiEditResult} alt="AI result" className="max-h-[300px] mx-auto rounded-lg" />
              </div>
            )}
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-violet-500/25 to-transparent mb-4" />

          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-fuchsia-300" />
            <h3 className="text-sm font-semibold">AI обработка через Cloudinary</h3>
            <span className="ml-auto text-[10px] text-violet-200/40">Загружает в облако · обрабатывает 10-60с</span>
          </div>

          {/* Простые AI кнопки */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            <AiCard icon={Eraser} label="Удалить фон" onClick={() => runAi({ type: "bg_remove" }, "Удаление фона")} />
            <AiCard icon={Maximize2} label="Upscale" onClick={() => runAi({ type: "upscale" }, "AI Upscale")} />
            <AiCard icon={Wand2} label="Улучшить" onClick={() => runAi({ type: "enhance" }, "AI улучшение")} />
            <AiCard icon={Sun} label="Восстановить" onClick={() => runAi({ type: "restore" }, "Восстановление")} />
            <AiCard icon={Layers} label="Тень" onClick={() => runAi({ type: "drop_shadow" }, "Drop shadow")} />
          </div>

          {/* Generative с промптами */}
          <div className="space-y-3 mb-4">
            <details className="rounded-xl border border-violet-400/15 bg-[#0a0c20]/40">
              <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center gap-2 text-violet-200/80 hover:text-white">
                <Replace className="h-3.5 w-3.5" /> Generative Replace · заменить объект на другой
              </summary>
              <div className="p-3 grid sm:grid-cols-3 gap-2">
                <input value={aiPromptFrom} onChange={(e) => setAiPromptFrom(e.target.value)}
                  placeholder="Что заменить (cat)" className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
                <input value={aiPromptTo} onChange={(e) => setAiPromptTo(e.target.value)}
                  placeholder="На что (dog)" className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
                <button onClick={() => runAi({ type: "gen_replace", from: aiPromptFrom, to: aiPromptTo }, "Generative Replace")}
                  disabled={!aiPromptFrom || !aiPromptTo}
                  className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Заменить
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-violet-400/15 bg-[#0a0c20]/40">
              <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center gap-2 text-violet-200/80 hover:text-white">
                <Layers className="h-3.5 w-3.5" /> Generative Background Replace · заменить фон по описанию
              </summary>
              <div className="p-3 grid sm:grid-cols-[1fr_auto] gap-2">
                <input value={aiBgPrompt} onChange={(e) => setAiBgPrompt(e.target.value)}
                  placeholder="Описание фона (sunset beach, neon city, forest)" className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
                <button onClick={() => runAi({ type: "gen_bg_replace", prompt: aiBgPrompt }, "Замена фона")}
                  disabled={!aiBgPrompt}
                  className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Заменить фон
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-violet-400/15 bg-[#0a0c20]/40">
              <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center gap-2 text-violet-200/80 hover:text-white">
                <Palette className="h-3.5 w-3.5" /> Generative Recolor · перекрасить объект
              </summary>
              <div className="p-3 grid sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input value={aiRecolorObj} onChange={(e) => setAiRecolorObj(e.target.value)}
                  placeholder="Объект (shirt, car, hair)" className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60" />
                <input type="color" value={aiRecolorTo} onChange={(e) => setAiRecolorTo(e.target.value)}
                  className="h-10 w-14 rounded-lg border border-violet-400/20 cursor-pointer bg-transparent" />
                <button onClick={() => runAi({ type: "gen_recolor", prompt: aiRecolorObj, toColor: aiRecolorTo }, "Перекрашивание")}
                  disabled={!aiRecolorObj}
                  className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Перекрасить
                </button>
              </div>
            </details>

            <details className="rounded-xl border border-violet-400/15 bg-[#0a0c20]/40">
              <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center gap-2 text-violet-200/80 hover:text-white">
                <Maximize2 className="h-3.5 w-3.5" /> Generative Fill · расширить фото с дорисовкой
              </summary>
              <div className="p-3 grid sm:grid-cols-[1fr_auto] gap-2">
                <select value={aiAspect} onChange={(e) => setAiAspect(e.target.value)}
                  className="rounded-lg bg-[#0a0c20]/70 border border-violet-400/15 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/60">
                  <option value="16:9">16:9 — широкое</option>
                  <option value="9:16">9:16 — вертикальное</option>
                  <option value="1:1">1:1 — квадрат</option>
                  <option value="4:3">4:3 — стандарт</option>
                  <option value="21:9">21:9 — кино</option>
                </select>
                <button onClick={() => runAi({ type: "gen_fill", aspectRatio: aiAspect }, "Generative Fill")}
                  className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-semibold">
                  Расширить
                </button>
              </div>
            </details>
          </div>

          {/* Результат AI */}
          {aiResultUrl && (
            <div className="rounded-xl border border-violet-400/20 bg-[#0a0c20]/60 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-sm text-emerald-300">Результат готов</span>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={applyAiAsBase} className="rounded-lg glass px-3 py-1.5 text-xs hover:border-violet-400/60">
                    Применить к холсту
                  </button>
                  <button onClick={downloadAi} className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold">
                    <Download className="h-3 w-3 inline mr-1" /> Скачать
                  </button>
                </div>
              </div>
              <img src={aiResultUrl} alt="AI result" className="max-h-[400px] mx-auto rounded-lg" />
            </div>
          )}

          {!file && (
            <div className="text-center text-xs text-violet-200/40 py-3">
              Сначала выбери фото через кнопку «Выбрать файл» сверху
            </div>
          )}
        </section>
      )}

      {/* Canvas + overlays */}
      <section className="rounded-3xl glass p-4 overflow-hidden" onDragOver={dragOver} onDrop={drop}>
        {baseImg ? (
          <div className="flex justify-center">
            <div ref={wrapRef} className="relative inline-block max-w-full" style={{ lineHeight: 0 }}>
              <canvas ref={canvasRef}
                onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp}
                className={`block max-w-full max-h-[600px] rounded-xl border border-violet-400/10 ${tool === "crop" ? "cursor-crosshair" : tool === "mosaic" ? "cursor-none" : "cursor-default"}`}
                style={{
                  imageRendering: "auto",
                  ...(tool === "mosaic" ? {
                    cursor: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'><circle cx='${brushSize/2}' cy='${brushSize/2}' r='${brushSize/2-1}' fill='none' stroke='%23a78bfa' stroke-width='2' opacity='0.8'/></svg>`)}") ${brushSize/2} ${brushSize/2}, crosshair`,
                  } : {}),
                }}
              />
              {/* Overlay'ы лежат поверх canvas. Каждый overlay сам по себе ловит события,
                  пустые места между ними прозрачны для canvas. */}
              {overlays.map((o) => (
                <DraggableOverlay key={o.id} overlay={o} selected={selectedId === o.id}
                  transformActive={selectedId === o.id && transformMode}
                  canvasWidth={baseImg.width} canvasHeight={baseImg.height}
                  onSelect={() => setSelectedId(o.id)}
                  onChange={(u) => updateOverlay(o.id, u)}
                  onDelete={() => deleteOverlay(o.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative aspect-video rounded-2xl bg-[#0a0c20]/60 border border-dashed border-violet-400/20 flex flex-col items-center justify-center gap-3 text-violet-200/40 cursor-pointer hover:border-violet-400/40 hover:text-violet-200/70 transition-colors overflow-hidden">
            <img
              src="./text.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-top opacity-20 pointer-events-none translate-y-10"
            />
            <ImagePlus className="relative h-12 w-12" />
            <span className="relative text-sm">Перетащи картинку сюда или вставь из буфера (Ctrl+V)</span>
            <div className="relative flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); onPick(); }} className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)]">
                Выбрать файл
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowLibrary("base"); }} className="rounded-lg glass px-4 py-2 text-xs hover:border-violet-400/60 transition-all">
                Из библиотеки
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Export */}
      <section className="rounded-3xl glass p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-violet-200/60">Формат:</span>
            {(["image/jpeg","image/webp","image/png"] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)} className={`rounded-lg px-3 py-1.5 text-xs border transition-all ${format===f?"bg-violet-600/30 border-violet-400/50 text-white":"border-violet-400/15 text-violet-200/60 hover:border-violet-400/40"}`}>{f.split("/")[1].toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-violet-200/60">Качество:</span>
            <input type="range" min={10} max={100} value={quality*100} onChange={(e) => setQuality(+e.target.value/100)} className="w-[120px] accent-violet-500" />
            <span className="text-xs text-violet-100 font-mono">{Math.round(quality*100)}%</span>
          </div>
          {estimatedSize && (
            <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-400/20 px-3 py-1.5">
              <span className="text-xs text-violet-200/60">≈</span>
              <span className="text-xs text-violet-100 font-semibold">{estimatedSize}</span>
            </div>
          )}
        </div>
        <button disabled={!baseImg} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold shadow-[0_8px_30px_-10px_rgba(139,92,246,0.7)] disabled:opacity-40"><Download className="h-4 w-4" /> Сохранить</button>
      </section>

      {/* Модальное окно: Из библиотеки */}
      {showLibrary && (
        <LibraryPicker
          mode={showLibrary}
          onClose={() => setShowLibrary(null)}
          onPick={onPickFromLibrary}
        />
      )}
    </div>
  );
}

// ===== Picker модалка =====
function LibraryPicker({
  mode, onClose, onPick,
}: {
  mode: "base" | "overlay";
  onClose: () => void;
  onPick: (data: string, name: string, asOverlay: boolean) => void;
}) {
  const [tab, setTab] = useState<"favorites" | "drafts">("favorites");
  const [favs] = useState<Favorite[]>(() => listFavorites().filter(f => f.source === "photo"));
  const [drafts] = useState<Draft[]>(() => listDrafts().filter(d => d.source === "photo"));
  const items = tab === "favorites" ? favs : drafts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong rounded-2xl p-5 w-[700px] max-w-[92%] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">
            {mode === "base" ? "Открыть фото из библиотеки" : "Добавить поверх из библиотеки"}
          </h3>
          <button onClick={onClose} className="text-violet-200/60 hover:text-white">✕</button>
        </div>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setTab("favorites")}
            className={`rounded-lg px-3 py-1.5 text-xs border transition-all ${
              tab === "favorites" ? "bg-yellow-500/20 border-yellow-400/50 text-yellow-200" : "border-violet-400/15 text-violet-200/60"
            }`}>
            ⭐ Избранное ({favs.length})
          </button>
          <button onClick={() => setTab("drafts")}
            className={`rounded-lg px-3 py-1.5 text-xs border transition-all ${
              tab === "drafts" ? "bg-violet-600/30 border-violet-400/50 text-white" : "border-violet-400/15 text-violet-200/60"
            }`}>
            Черновики ({drafts.length})
          </button>
        </div>
        <div className="flex-1 overflow-y-auto rounded-xl bg-[#0a0c20]/40 border border-violet-400/10 p-3">
          {items.length === 0 ? (
            <p className="text-center text-sm text-violet-200/40 py-12">
              {tab === "favorites" ? "В избранном пока нет фото" : "Нет черновиков"}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {items.map((it: any) => (
                <button key={it.id}
                  onClick={() => {
                    // Используем data если есть, иначе preview (для overlay подойдёт и превью)
                    const img = it.data || it.preview;
                    if (!img) {
                      alert("У этого элемента нет изображения.");
                      return;
                    }
                    onPick(img, it.name, mode === "overlay");
                  }}
                  className="group rounded-xl overflow-hidden border border-violet-400/15 hover:border-violet-400/60 transition-all bg-[#0a0c20]/40">
                  <div className="aspect-square bg-black/40 flex items-center justify-center overflow-hidden">
                    {it.preview ? (
                      <img src={it.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-violet-200/30 text-xs">нет превью</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] truncate text-white">{it.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Universal draggable/resizable overlay ----
function DraggableOverlay({ overlay, selected, transformActive, canvasWidth, canvasHeight, onSelect, onChange, onDelete }: {
  overlay: Overlay; selected: boolean; transformActive?: boolean;
  canvasWidth: number; canvasHeight: number;
  onSelect: () => void; onChange: (u: Partial<Overlay>) => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0, scale: 1 });
  const startSize = useRef(overlay.size);

  // Получить коэффициент масштаба canvas (отображаемая ширина / реальная)
  const getScale = () => {
    const parent = ref.current?.parentElement;
    if (!parent) return 1;
    const rect = parent.getBoundingClientRect();
    return rect.width / canvasWidth;
  };

  const onDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault(); onSelect();
    const scale = getScale();
    if ((e.target as HTMLElement).dataset.resize) {
      setResizing(true); startSize.current = overlay.size;
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: overlay.x, oy: overlay.y, scale };
      return;
    }
    if ((e.target as HTMLElement).contentEditable === "true" && selected) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: overlay.x, oy: overlay.y, scale };
  };

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: MouseEvent) => {
      const { mx, my, ox, oy, scale } = dragStart.current;
      if (dragging) {
        // Перевод дельты экрана в дельту canvas
        const dx = (e.clientX - mx) / scale;
        const dy = (e.clientY - my) / scale;
        onChange({
          x: Math.max(0, Math.min(canvasWidth, ox + dx)),
          y: Math.max(0, Math.min(canvasHeight, oy + dy)),
        });
      }
      if (resizing) {
        const dy = (e.clientY - my) / scale;
        onChange({ size: Math.max(16, Math.min(canvasWidth, startSize.current + dy)) });
      }
    };
    const onUp = () => { setDragging(false); setResizing(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, resizing, canvasWidth, canvasHeight]);

  // Реальный отображаемый размер canvas (в CSS пикселях)
  const [displaySize, setDisplaySize] = useState({ w: canvasWidth, h: canvasHeight });
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setDisplaySize({ w: r.width, h: r.height });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  const scale = displaySize.w / canvasWidth;
  const leftPx = overlay.x * scale;
  const topPx = overlay.y * scale;
  const sizePx = overlay.size * scale;

  const renderContent = () => {
    switch (overlay.type) {
      case "text": {
        const ts = overlay.textStyle ?? "shadow";
        const c = overlay.color || "#ffffff";
        const styleExtras: React.CSSProperties = {};
        if (ts === "shadow") styleExtras.textShadow = "0 4px 10px rgba(0,0,0,0.8)";
        if (ts === "glow") styleExtras.textShadow = `0 0 5px ${c},0 0 10px ${c},0 0 20px ${c}`;
        if (ts === "outline") (styleExtras as any).WebkitTextStroke = "2px black";
        if (ts === "neon") {
          styleExtras.color = "#fff";
          styleExtras.textShadow = `0 0 5px #fff,0 0 10px ${c},0 0 20px ${c},0 0 40px ${c}`;
        }
        if (ts === "italic") styleExtras.fontStyle = "italic";
        if (ts === "gradient") {
          styleExtras.background = "linear-gradient(90deg,#ff00cc,#3333ff)";
          (styleExtras as any).WebkitBackgroundClip = "text";
          (styleExtras as any).WebkitTextFillColor = "transparent";
          styleExtras.backgroundClip = "text";
        }
        if (ts === "uppercase") {
          styleExtras.textTransform = "uppercase";
          styleExtras.letterSpacing = "2px";
          styleExtras.textShadow = "0 2px 6px rgba(0,0,0,0.7)";
        }
        if (ts === "shadow3d") {
          const s = c;
          styleExtras.textShadow = `1px 1px 0 ${s},2px 2px 0 ${s},3px 3px 0 ${s},4px 4px 0 ${s},5px 5px 0 ${s},6px 6px 8px rgba(0,0,0,0.4)`;
        }
        if (ts === "fire") {
          styleExtras.color = "#fff";
          styleExtras.textShadow = "0 -2px 4px #FFC65C,0 -4px 10px #FF7733,0 -8px 20px #FF3300,0 -12px 30px #FF0000";
        }
        return (
          <div
            contentEditable
            suppressContentEditableWarning
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => onChange({ text: e.currentTarget.textContent ?? "" })}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="outline-none whitespace-pre-wrap px-1"
            style={{
              fontFamily: overlay.font,
              fontSize: `${sizePx}px`,
              fontWeight: "bold",
              color: c,
              minWidth: "20px",
              cursor: "text",
              lineHeight: 1.15,
              ...styleExtras,
            }}
          >
            {overlay.text}
          </div>
        );
      }
      case "photo":
        return (
          <img
            src={overlay.imgSrc}
            alt=""
            style={{ width: `${sizePx}px`, height: "auto", borderRadius: 8 }}
            draggable={false}
          />
        );
      case "shape": {
        const shapeDef = SHAPES.find(s => s.id === overlay.shape);
        return shapeDef ? (
          <div
            style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
            dangerouslySetInnerHTML={{ __html: shapeDef.svg(overlay.shapeColor || "#a78bfa") }}
          />
        ) : null;
      }
      case "sticker":
        return (
          <span style={{ fontSize: `${sizePx}px`, lineHeight: 1 }}>
            {overlay.emoji}
          </span>
        );
      default: return null;
    }
  };

  return (
    <div
      ref={ref}
      onMouseDown={onDown}
      className={`absolute select-none group ${selected ? "ring-2 ring-violet-400/60 rounded-lg" : ""}`}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      {renderContent()}
      {selected && (
        <>
          {transformActive ? (
            /* Ctrl+T: рамка трансформации с 8 ручками */
            <div className="absolute inset-[-6px] border-2 border-dashed border-blue-400/80 rounded pointer-events-none">
              {/* Углы */}
              <div data-resize="true" className="absolute -top-[5px] -left-[5px] h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-nwse-resize pointer-events-auto" />
              <div data-resize="true" className="absolute -top-[5px] -right-[5px] h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-nesw-resize pointer-events-auto" />
              <div data-resize="true" className="absolute -bottom-[5px] -left-[5px] h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-nesw-resize pointer-events-auto" />
              <div data-resize="true" className="absolute -bottom-[5px] -right-[5px] h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-nwse-resize pointer-events-auto" />
              {/* Середины сторон */}
              <div data-resize="true" className="absolute -top-[5px] left-1/2 -translate-x-1/2 h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-ns-resize pointer-events-auto" />
              <div data-resize="true" className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-ns-resize pointer-events-auto" />
              <div data-resize="true" className="absolute top-1/2 -left-[5px] -translate-y-1/2 h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-ew-resize pointer-events-auto" />
              <div data-resize="true" className="absolute top-1/2 -right-[5px] -translate-y-1/2 h-[10px] w-[10px] bg-white border-2 border-blue-500 cursor-ew-resize pointer-events-auto" />
            </div>
          ) : (
            <>
              <div data-resize="true" className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full bg-violet-500 border-2 border-white cursor-nwse-resize opacity-80 hover:opacity-100" />
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute -top-3 -right-3 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">✕</button>
            </>
          )}
        </>
      )}
    </div>
  );
}


// ---- AI tile button ----
function AiCard({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group rounded-xl bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10 border border-fuchsia-400/20 hover:border-fuchsia-400/60 hover:from-fuchsia-500/25 hover:to-violet-500/25 transition-all px-3 py-3 flex flex-col items-center gap-2">
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-violet-500/15 border border-fuchsia-400/30 flex items-center justify-center group-hover:border-fuchsia-400/60">
        <Icon className="h-4 w-4 text-fuchsia-200" />
      </div>
      <span className="text-[11px] text-violet-100/90 text-center leading-tight">{label}</span>
    </button>
  );
}
