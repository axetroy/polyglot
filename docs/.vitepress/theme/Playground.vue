<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useData } from "vitepress";
import {
  synthesize,
  inspect,
  extract,
  detectFrontFormat,
  buildZip,
  type PolyglotInspection,
  type ZipEntryInput,
} from "@polyglot/browser";

const { lang } = useData();

const messages = {
  zh: {
    tabCreate: "合成",
    tabInspect: "解析",
    frontImage: "① 前端图像",
    dropBefore: "拖拽或",
    dropAction: "点击选择",
    dropFrontSuffix: "PNG / JPEG",
    dropAnySuffix: "任意文件",
    file: "文件",
    format: "格式",
    size: "大小",
    remove: "移除",
    archiveEntries: "② 归档条目",
    noEntries: "还没有条目。添加文本条目，或上传任意文件作为二进制条目。",
    entryPlaceholder: "条目内容（UTF-8）…",
    binaryEntry: "二进制条目 · {{size}} 字节",
    addText: "＋ 文本条目",
    uploadFiles: "＋ 上传文件",
    clear: "清空",
    synthesizing: "合成中…",
    synthesize: "合成 Polyglot 文件",
    result: "③ 结果",
    resultEmpty: "合成结果会显示在这里。",
    front: "前端",
    back: "后端",
    total: "总计",
    entries: "条目",
    resultHint: "图片查看器正常显示，ZIP 工具可读取偏移量处的归档。",
    download: "⬇ 下载 {{name}}",
    inspectFile: "选择文件",
    inspection: "检测结果",
    isPolyglot: "✓ 这是一个 polyglot 文件",
    notPolyglot: "✗ 不是 polyglot 文件",
    frontSection: "前端",
    backSection: "后端",
    dimensions: "尺寸",
    bytes: "字节",
    valid: "有效",
    yes: "是",
    no: "否",
    noFront: "未识别到图像前端。",
    noBack: "图像之后没有归档数据。",
    downloadEntry: "下载",
    downloadZip: "下载为 ZIP ⬇",
    downloadZipHint: "将归档内容打包为标准 ZIP 文件下载（浏览器本地构建，不上传）",
    howItWorks: "原理",
    howItWorksHint:
      "图像字节原样保留；归档中所有绝对偏移量（EOCD 与中央目录指针）统一加上图像长度，因此 ZIP 读取器能正确定位到归档内部。全部处理在浏览器本地完成，文件不会上传。",
    unknownFormat: "未知格式",
    unsupportedFront: "不支持的前端格式：{{name}}。请选择 PNG 或 JPEG 图片。",
  },
  en: {
    tabCreate: "Create",
    tabInspect: "Inspect",
    frontImage: "① Front image",
    dropBefore: "Drag & drop or ",
    dropAction: "click to select",
    dropFrontSuffix: "a PNG / JPEG",
    dropAnySuffix: "any file",
    file: "File",
    format: "Format",
    size: "Size",
    remove: "Remove",
    archiveEntries: "② Archive entries",
    noEntries: "No entries yet. Add a text entry, or upload any file as a binary entry.",
    entryPlaceholder: "Entry content (UTF-8)…",
    binaryEntry: "Binary entry · {{size}} bytes",
    addText: "＋ Text entry",
    uploadFiles: "＋ Upload files",
    clear: "Clear",
    synthesizing: "Synthesizing…",
    synthesize: "Synthesize polyglot file",
    result: "③ Result",
    resultEmpty: "The synthesized file will appear here.",
    front: "Front",
    back: "Back",
    total: "Total",
    entries: "Entries",
    resultHint: "Image viewers render it normally; ZIP tools read the archive at its offset.",
    download: "⬇ Download {{name}}",
    inspectFile: "Inspect a file",
    inspection: "Inspection",
    isPolyglot: "✓ This is a polyglot file",
    notPolyglot: "✗ Not a polyglot file",
    frontSection: "Front",
    backSection: "Back",
    dimensions: "Dimensions",
    bytes: "Bytes",
    valid: "Valid",
    yes: "Yes",
    no: "No",
    noFront: "No image front detected.",
    noBack: "No archive data after the image.",
    downloadEntry: "Download",
    downloadZip: "Download as ZIP ⬇",
    downloadZipHint:
      "Repackage the archive contents as a standard ZIP for download (built locally in the browser, nothing is uploaded)",
    howItWorks: "How it works",
    howItWorksHint:
      "Image bytes are preserved verbatim; every absolute offset in the archive (EOCD and central-directory pointers) is shifted by the image length, so ZIP readers can locate the archive correctly. Everything runs locally in the browser; nothing is uploaded.",
    unknownFormat: "Unknown format",
    unsupportedFront: "Unsupported front format: {{name}}. Please choose a PNG or JPEG image.",
  },
};

type MessageKey = keyof typeof messages.zh;

const locale = computed<"zh" | "en">(() => (lang.value.startsWith("en") ? "en" : "zh"));

function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = messages[locale.value][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return text;
}

const diagram = computed(() =>
  [
    "┌──────────────────────────┬────────────────────────────┐",
    "│   PNG / JPEG bytes       │   ZIP (offset-relocated)   │",
    "│   readable by viewers    │   readable by ZIP tools    │",
    "└──────────────────────────┴────────────────────────────┘",
  ].join("\n")
);

type Mode = "create" | "inspect";

interface EditorEntry {
  id: number;
  name: string;
  kind: "text" | "binary";
  text: string;
  data: Uint8Array | null;
}

interface CreateResult {
  blobUrl: string;
  fileName: string;
  frontFormat: string;
  frontSize: number;
  backSize: number;
  totalSize: number;
  entryCount: number;
  width: number;
  height: number;
}

interface InspectEntry {
  name: string;
  size: number;
  /** Text preview for display; null when the entry is binary. */
  preview: string | null;
  /** Original bytes — used to rebuild a correct ZIP on download. */
  rawData: Uint8Array;
}

interface InspectResult {
  info: PolyglotInspection;
  fileName: string;
  fileSize: number;
  frontPreview: string | null;
  extracted: InspectEntry[];
}

const mode = ref<Mode>("create");
const error = ref("");
const busy = ref(false);

// ── Create state ──────────────────────────────────────────
const frontFile = ref<File | null>(null);
const frontBytes = ref<Uint8Array | null>(null);
const frontPreview = ref<string | null>(null);
const entries = ref<EditorEntry[]>([]);
const result = ref<CreateResult | null>(null);
let nextId = 1;

// ── Inspect state ─────────────────────────────────────────
const inspectResult = ref<InspectResult | null>(null);

const frontFormatLabel = computed(() => {
  if (!frontBytes.value) return "";
  const format = detectFrontFormat(frontBytes.value);
  return format ? format.toUpperCase() : t("unknownFormat");
});

const canSynthesize = computed(
  () => Boolean(frontBytes.value) && entries.value.length > 0 && !busy.value
);

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

function clearOutput() {
  if (result.value) URL.revokeObjectURL(result.value.blobUrl);
  result.value = null;
  if (inspectResult.value) {
    if (inspectResult.value.frontPreview) URL.revokeObjectURL(inspectResult.value.frontPreview);
    for (const entry of inspectResult.value.extracted) {
      if (entry.preview) URL.revokeObjectURL(entry.preview);
    }
  }
  inspectResult.value = null;
  error.value = "";
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

// ── Front image ───────────────────────────────────────────
async function onFrontSelected(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  clearOutput();

  const bytes = await readFileBytes(file);
  const format = detectFrontFormat(bytes);
  if (!format) {
    error.value = t("unsupportedFront", { name: file.name });
    return;
  }

  frontFile.value = file;
  frontBytes.value = bytes;
  if (frontPreview.value) URL.revokeObjectURL(frontPreview.value);
  frontPreview.value = URL.createObjectURL(file);
}

function clearFront() {
  clearOutput();
  frontFile.value = null;
  frontBytes.value = null;
  if (frontPreview.value) URL.revokeObjectURL(frontPreview.value);
  frontPreview.value = null;
}

// ── Entry editing ─────────────────────────────────────────
function addTextEntry() {
  entries.value.push({
    id: nextId++,
    name: `entry-${entries.value.length + 1}.txt`,
    kind: "text",
    text: "",
    data: null,
  });
}

async function addBinaryEntries(files: FileList | null) {
  if (!files) return;
  for (const file of Array.from(files)) {
    const data = await readFileBytes(file);
    entries.value.push({ id: nextId++, name: file.name, kind: "binary", text: "", data });
  }
}

function removeEntry(id: number) {
  entries.value = entries.value.filter((entry) => entry.id !== id);
}

function clearEntries() {
  entries.value = [];
}

/** Materialise the editor rows into the payload the engine consumes. */
function collectEntries(): ZipEntryInput[] {
  return entries.value.map((entry) => ({
    name: entry.name.trim() || "unnamed",
    data:
      entry.kind === "text"
        ? new TextEncoder().encode(entry.text)
        : (entry.data ?? new Uint8Array(0)),
  }));
}

function entrySize(entry: EditorEntry): number {
  if (entry.kind === "text") return new TextEncoder().encode(entry.text).length;
  return entry.data?.length ?? 0;
}

// ── Actions ───────────────────────────────────────────────
function runSynthesize() {
  if (!frontBytes.value) return;
  clearOutput();
  busy.value = true;

  try {
    const output = synthesize(frontBytes.value, { entries: collectEntries() });
    const ext = output.frontFormat === "png" ? "png" : "jpg";
    const blob = new Blob([output.data as BlobPart], { type: "application/octet-stream" });

    result.value = {
      blobUrl: URL.createObjectURL(blob),
      fileName: `polyglot.${ext}`,
      frontFormat: output.frontFormat.toUpperCase(),
      frontSize: output.frontSize,
      backSize: output.backSize,
      totalSize: output.totalSize,
      entryCount: output.entryCount,
      width: output.width,
      height: output.height,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function onInspectSelected(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  clearOutput();
  busy.value = true;

  try {
    const bytes = await readFileBytes(file);
    const info = inspect(bytes);

    let frontPreviewUrl: string | null = null;
    if (info.front) {
      const frontEnd = info.front.size;
      frontPreviewUrl = URL.createObjectURL(new Blob([bytes.subarray(0, frontEnd) as BlobPart]));
    }

    let extracted: InspectResult["extracted"] = [];
    if (info.isPolyglot) {
      const parts = await extract(bytes);
      extracted = parts.entries.map((entry) => {
        const isText = !/[\u0000-\u0008\u000e-\u001f]/.test(
          new TextDecoder("utf-8", { fatal: false }).decode(entry.data.subarray(0, 512))
        );
        return {
          name: entry.name,
          size: entry.data.length,
          preview: isText ? new TextDecoder().decode(entry.data) : null,
          rawData: entry.data,
        };
      });
    }

    inspectResult.value = {
      info,
      fileName: file.name,
      fileSize: bytes.length,
      frontPreview: frontPreviewUrl,
      extracted,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function downloadEntry(name: string, index: number) {
  const entry = inspectResult.value?.extracted[index];
  if (!entry) return;
  const blob = new Blob([entry.rawData], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadZip() {
  const entries = inspectResult.value?.extracted;
  if (!entries || entries.length === 0) return;
  const zipBytes = buildZip(entries.map((e) => ({ name: e.name, data: e.rawData })));
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = inspectResult.value!.fileName.replace(/\.(png|jpg|jpeg)$/i, "") + ".zip";
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  // Guard: SSR renders no interactive state.
  if (typeof window === "undefined") return;
});
</script>

<template>
  <div class="pg-root">
    <div class="pg-tabs">
      <button :class="['pg-tab', { active: mode === 'create' }]" @click="mode = 'create'">
        {{ t("tabCreate") }}
      </button>
      <button :class="['pg-tab', { active: mode === 'inspect' }]" @click="mode = 'inspect'">
        {{ t("tabInspect") }}
      </button>
    </div>

    <p v-if="error" class="pg-error">{{ error }}</p>

    <!-- ══════════ CREATE ══════════ -->
    <div v-if="mode === 'create'" class="pg-grid">
      <div class="pg-col">
        <!-- Front image -->
        <section class="pg-card">
          <h3>{{ t("frontImage") }}</h3>
          <label class="pg-drop">
            <input
              type="file"
              accept="image/png,image/jpeg"
              @change="onFrontSelected(($event.target as HTMLInputElement).files)"
            />
            <span class="pg-drop-icon">🖼️</span>
            <span class="pg-drop-text"
              >{{ t("dropBefore") }}<strong>{{ t("dropAction") }}</strong>
              {{ t("dropFrontSuffix") }}</span
            >
          </label>

          <div v-if="frontPreview" class="pg-preview">
            <img :src="frontPreview" alt="front preview" />
            <dl>
              <div>
                <dt>{{ t("file") }}</dt>
                <dd>{{ frontFile?.name }}</dd>
              </div>
              <div>
                <dt>{{ t("format") }}</dt>
                <dd>{{ frontFormatLabel }}</dd>
              </div>
              <div>
                <dt>{{ t("size") }}</dt>
                <dd>{{ formatBytes(frontBytes?.length ?? 0) }}</dd>
              </div>
            </dl>
            <button class="pg-btn-ghost" @click="clearFront">{{ t("remove") }}</button>
          </div>
        </section>

        <!-- Entries -->
        <section class="pg-card">
          <h3>{{ t("archiveEntries") }}</h3>
          <p v-if="entries.length === 0" class="pg-hint">{{ t("noEntries") }}</p>

          <div v-for="entry in entries" :key="entry.id" class="pg-entry">
            <div class="pg-entry-head">
              <input v-model="entry.name" class="pg-input pg-name" placeholder="filename.txt" />
              <span class="pg-size">{{ formatBytes(entrySize(entry)) }}</span>
              <button class="pg-btn-ghost" @click="removeEntry(entry.id)">✕</button>
            </div>
            <textarea
              v-if="entry.kind === 'text'"
              v-model="entry.text"
              class="pg-input pg-textarea"
              :placeholder="t('entryPlaceholder')"
              rows="2"
            />
            <p v-else class="pg-hint pg-binary">
              {{ t("binaryEntry", { size: entry.data?.length ?? 0 }) }}
            </p>
          </div>

          <div class="pg-actions">
            <button class="pg-btn-ghost" @click="addTextEntry">{{ t("addText") }}</button>
            <label class="pg-btn-ghost pg-file-label">
              {{ t("uploadFiles") }}
              <input
                type="file"
                multiple
                @change="addBinaryEntries(($event.target as HTMLInputElement).files)"
              />
            </label>
            <button v-if="entries.length" class="pg-btn-ghost" @click="clearEntries">
              {{ t("clear") }}
            </button>
          </div>
        </section>

        <button class="pg-btn-primary" :disabled="!canSynthesize" @click="runSynthesize">
          {{ busy ? t("synthesizing") : t("synthesize") }}
        </button>
      </div>

      <!-- Output -->
      <div class="pg-col">
        <section class="pg-card">
          <h3>{{ t("result") }}</h3>
          <p v-if="!result" class="pg-hint">{{ t("resultEmpty") }}</p>

          <template v-else>
            <dl class="pg-metrics">
              <div>
                <dt>{{ t("front") }}</dt>
                <dd>{{ formatBytes(result.frontSize) }}</dd>
              </div>
              <div>
                <dt>{{ t("back") }}</dt>
                <dd>{{ formatBytes(result.backSize) }}</dd>
              </div>
              <div>
                <dt>{{ t("total") }}</dt>
                <dd>{{ formatBytes(result.totalSize) }}</dd>
              </div>
              <div>
                <dt>{{ t("entries") }}</dt>
                <dd>{{ result.entryCount }}</dd>
              </div>
            </dl>

            <img class="pg-result-img" :src="result.blobUrl" alt="result preview" />
            <p class="pg-hint">
              {{ result.frontFormat }} · {{ result.width }}×{{ result.height }} —
              {{ t("resultHint") }}
            </p>

            <a
              class="pg-btn-primary pg-download"
              :href="result.blobUrl"
              :download="result.fileName"
              >{{ t("download", { name: result.fileName }) }}</a
            >
          </template>
        </section>
      </div>
    </div>

    <!-- ══════════ INSPECT ══════════ -->
    <div v-else>
      <section class="pg-card">
        <h3>{{ t("inspectFile") }}</h3>
        <label class="pg-drop">
          <input
            type="file"
            @change="onInspectSelected(($event.target as HTMLInputElement).files)"
          />
          <span class="pg-drop-icon">🔍</span>
          <span class="pg-drop-text"
            >{{ t("dropBefore") }}<strong>{{ t("dropAction") }}</strong>
            {{ t("dropAnySuffix") }}</span
          >
        </label>
      </section>

      <section v-if="inspectResult" class="pg-card">
        <h3>{{ t("inspection") }}</h3>
        <p class="pg-verdict" :class="inspectResult.info.isPolyglot ? 'ok' : 'no'">
          {{ inspectResult.info.isPolyglot ? t("isPolyglot") : t("notPolyglot") }}
        </p>
        <p class="pg-hint">
          {{ inspectResult.fileName }} · {{ formatBytes(inspectResult.fileSize) }}
        </p>

        <div class="pg-inspect-grid">
          <div>
            <h4>{{ t("frontSection") }}</h4>
            <template v-if="inspectResult.info.front">
              <img
                v-if="inspectResult.frontPreview"
                class="pg-result-img"
                :src="inspectResult.frontPreview"
                alt="front"
              />
              <dl class="pg-kv">
                <div>
                  <dt>{{ t("format") }}</dt>
                  <dd>{{ inspectResult.info.front.format.toUpperCase() }}</dd>
                </div>
                <div>
                  <dt>{{ t("dimensions") }}</dt>
                  <dd>
                    {{ inspectResult.info.front.width }}×{{ inspectResult.info.front.height }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("bytes") }}</dt>
                  <dd>{{ formatBytes(inspectResult.info.front.size) }}</dd>
                </div>
                <div>
                  <dt>{{ t("valid") }}</dt>
                  <dd>{{ inspectResult.info.front.valid ? t("yes") : t("no") }}</dd>
                </div>
              </dl>
            </template>
            <p v-else class="pg-hint">{{ t("noFront") }}</p>
          </div>

          <div>
            <h4>{{ t("backSection") }}</h4>
            <template v-if="inspectResult.info.back">
              <dl class="pg-kv">
                <div>
                  <dt>{{ t("format") }}</dt>
                  <dd>ZIP</dd>
                </div>
                <div>
                  <dt>{{ t("entries") }}</dt>
                  <dd>{{ inspectResult.info.back.entryCount }}</dd>
                </div>
                <div>
                  <dt>{{ t("bytes") }}</dt>
                  <dd>{{ formatBytes(inspectResult.info.back.size) }}</dd>
                </div>
              </dl>
              <ul class="pg-entry-list">
                <li v-for="(entry, index) in inspectResult.extracted" :key="entry.name">
                  <span class="pg-entry-name">{{ entry.name }}</span>
                  <span class="pg-size">{{ formatBytes(entry.size) }}</span>
                  <button class="pg-btn-sm" @click="downloadEntry(entry.name, index)">
                    {{ t("downloadEntry") }}
                  </button>
                </li>
              </ul>
              <div class="pg-zip-actions">
                <button class="pg-btn pg-btn-primary" @click="downloadZip">
                  {{ t("downloadZip") }}
                </button>
                <span class="pg-hint">{{ t("downloadZipHint") }}</span>
              </div>
            </template>
            <p v-else class="pg-hint">{{ t("noBack") }}</p>
          </div>
        </div>

        <p v-if="inspectResult.info.error" class="pg-error">{{ inspectResult.info.error }}</p>
      </section>
    </div>

    <!-- How it works -->
    <section class="pg-card pg-diagram">
      <h3>{{ t("howItWorks") }}</h3>
      <pre>{{ diagram }}</pre>
      <p class="pg-hint">{{ t("howItWorksHint") }}</p>
    </section>
  </div>
</template>

<style scoped>
.pg-root {
  margin-top: 24px;
}

.pg-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 20px;
}

.pg-tab {
  padding: 8px 18px;
  font-size: 14px;
  color: var(--vp-c-text-2);
  border-bottom: 2px solid transparent;
  background: none;
  cursor: pointer;
  transition: color 0.2s;
}

.pg-tab:hover {
  color: var(--vp-c-text-1);
}

.pg-tab.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.pg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 840px) {
  .pg-grid {
    grid-template-columns: 1fr;
  }
}

.pg-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pg-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.pg-card h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.pg-card h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.pg-drop {
  display: block;
  position: relative;
  border: 2px dashed var(--vp-c-divider);
  border-radius: 10px;
  padding: 26px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.pg-drop:hover {
  border-color: var(--vp-c-brand-1);
}

.pg-drop input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.pg-drop-icon {
  display: block;
  font-size: 26px;
  margin-bottom: 6px;
}

.pg-drop-text {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.pg-preview {
  margin-top: 14px;
}

.pg-preview img,
.pg-result-img {
  max-width: 100%;
  max-height: 240px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  display: block;
}

.pg-preview dl,
.pg-kv {
  margin: 10px 0;
  font-size: 13px;
}

.pg-preview dl div,
.pg-kv div {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}

.pg-preview dt,
.pg-kv dt {
  color: var(--vp-c-text-2);
  min-width: 68px;
  margin: 0;
}

.pg-preview dd,
.pg-kv dd {
  margin: 0;
  font-weight: 500;
}

.pg-entry {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  background: var(--vp-c-bg);
}

.pg-entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pg-name {
  flex: 1;
}

.pg-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: inherit;
}

.pg-textarea {
  margin-top: 8px;
  font-family: var(--vp-font-family-mono);
  resize: vertical;
}

.pg-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.pg-size {
  font-size: 12px;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.pg-binary {
  margin: 8px 0 0;
}

.pg-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.pg-btn-ghost {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: border-color 0.2s;
}

.pg-btn-ghost:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.pg-file-label {
  position: relative;
  display: inline-block;
}

.pg-file-label input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.pg-btn-primary {
  width: 100%;
  padding: 11px 20px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  display: block;
  transition: background 0.2s;
}

.pg-btn-primary:hover {
  background: var(--vp-c-brand-2);
}

.pg-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pg-download {
  margin-top: 14px;
}

.pg-btn-sm {
  padding: 2px 8px;
  font-size: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-mute);
  cursor: pointer;
  color: var(--vp-c-text-2);
  transition: all 0.15s;
}

.pg-btn-sm:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.pg-zip-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--vp-c-divider);
}

.pg-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0 0 14px;
}

.pg-metrics div {
  text-align: center;
  padding: 8px 4px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.pg-metrics dt {
  font-size: 11px;
  color: var(--vp-c-text-2);
  margin: 0;
}

.pg-metrics dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.pg-hint {
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin: 8px 0 0;
  line-height: 1.6;
}

.pg-error {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  margin-bottom: 16px;
}

.pg-verdict {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}

.pg-verdict.ok {
  color: var(--vp-c-green-1);
}

.pg-verdict.no {
  color: var(--vp-c-text-2);
}

.pg-inspect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

@media (max-width: 640px) {
  .pg-inspect-grid {
    grid-template-columns: 1fr;
  }
}

.pg-entry-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}

.pg-entry-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  background: var(--vp-c-bg);
}

.pg-entry-name {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.pg-entry-list .pg-size {
  margin-left: auto;
}

.pg-diagram pre {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 14px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}
</style>
