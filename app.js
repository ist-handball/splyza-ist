// ============================================================================
// SPLYZA Teams Clone - Core Application Logic
// ============================================================================

// グローバルエラー監視 (デバッグ用)
window.addEventListener("error", function(e) {
    const errorMsg = `JS Error: ${e.message}\nFile: ${e.filename.split('/').pop()}\nLine: ${e.lineno}:${e.colno}`;
    console.error(errorMsg);
    alert("エラーを検知しました:\n" + errorMsg);
});

// ----------------------------------------------------------------------------
// 0. 初期化フラグと通知システム
// ----------------------------------------------------------------------------
let isDOMReady = false;
let isYTAPIReady = false;

// トースト通知を表示する関数
function showNotification(message, type = "info", duration = 4000) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "fa-info-circle";
    if (type === "error") icon = "fa-exclamation-circle";
    else if (type === "warning") icon = "fa-exclamation-triangle";
    else if (type === "success") icon = "fa-check-circle";
    
    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    toast.querySelector(".toast-close").addEventListener("click", () => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    });
    
    container.appendChild(toast);
    
    // アニメーション用に少し遅らせてクラス付与
    setTimeout(() => {
        toast.classList.add("show");
    }, 50);
    
    // 自動消去
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// ----------------------------------------------------------------------------
// 1. グローバル状態管理
// ----------------------------------------------------------------------------
const state = {
    // ユーザー情報
    username: "ゲストユーザー",
    
    // 現在のYouTube動画ID
    videoId: "", // デフォルト動画なし (ユーザーが入力して読込する)
    
    // UIモード ('analysis-mode' | 'tactics-mode')
    activeTab: "analysis-mode",
    
    // Firebase設定 & 接続ステータス
    firebaseConfig: null,
    isFirebaseEnabled: false,
    db: null,
    unsubscribeList: [], // リアルタイムリスナーの解除用

    // 映像分析用データ (Firebase未接続時はLocalStorageにフォールバック)
    annotations: [], // 描き込みデータ
    tags: [],        // プレー分類タグ
    comments: [],    // タイムタグ付きチャット

    // 作戦盤用データ
    courtType: "handball",
    tacticsPieces: [], // コート上の駒リスト { id, team, number, x, y }
    tacticsDrawings: [], // 作戦盤上の描画パス

    // YouTube プレイヤー関連
    player: null,
    playerReady: false,
    playbackTime: 0,   // 現在の再生時間（秒）
    duration: 0,       // 動画の総再生時間（秒）
    timeTrackerInterval: null,

    // アノテーションCanvas関連
    canvas: null,
    ctx: null,
    isDrawing: false,
    activeTool: "", // 'pen' | 'arrow' | 'rect' | 'circle' | 'text' (デフォルトはツール未選択の動画閲覧モード)
    currentColor: "#ff4757",
    brushSize: 4,
    eraserSize: 8, // 消しゴム用のサイズ状態を追加
    startX: 0,
    startY: 0,
    currentDrawingObj: null, // 現在描画中のオブジェクト

    // 作戦盤Canvas関連
    tacticsCanvas: null,
    tacticsCtx: null,
    isTacticsDrawing: false,
    activeTacticsTool: "pen", // 'pen' | 'eraser'
    currentTacticsColor: "#ffffff",
    tacticsHistory: [],
    
    // ドラッグとプレビュー制御用の変数
    isDraggingPiece: false,
    pendingTacticsRender: false,
    eraserPreviewTimeout: null,
    
    // 動画の履歴管理
    videoHistory: [],
    tagFilterPlayer: "all",
    selectedQuickTags: [],
    quickTags: ["シュート（成功）", "シュート（枠外）", "シュート（セーブ）", "警告", "退場", "ターンオーバー"],
    lastOverlayIds: ""
};

// ----------------------------------------------------------------------------
// 2. 初期化とイベントリスナー設定
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    isDOMReady = true;
    console.log("ANALYST: DOMContentLoaded Triggered");
    
    try {
        console.log("ANALYST: Initializing DOM references...");
        initDOMReferences();
        
        console.log("ANALYST: Loading settings...");
        loadSettingsFromStorage();
        
        console.log("ANALYST: Initializing tabs...");
        initAppTabs();
        
        console.log("ANALYST: Initializing canvas...");
        initCanvas();
        
        console.log("ANALYST: Initializing tactics canvas...");
        initTacticsCanvas();
        
        console.log("ANALYST: Initializing drag and drop...");
        initDragAndDrop();
        
        console.log("ANALYST: Setting up event listeners...");
        setupEventListeners();
        
        console.log("ANALYST: Updating UI for Firebase status...");
        updateUIForFirebaseStatus();
        
        console.log("ANALYST: Loading all data...");
        loadAllData();
        
        console.log("ANALYST: Rendering tags list...");
        renderTagsList();
        
        showNotification("アプリケーションが正常に初期化されました。", "success", 2000);
    } catch (e) {
        console.error("ANALYST: Initialization Error", e);
        alert("アプリ起動中にエラーが発生しました:\n" + e.message + "\n" + e.stack);
        return;
    }

    // YouTube APIが既にロード済みの場合のフォールバック (動画IDが設定されている場合のみ起動)
    if ((isYTAPIReady || (typeof YT !== "undefined" && YT.Player)) && state.videoId) {
        isYTAPIReady = true;
        initYouTubePlayer();
    }

    // 7秒後に YouTube API がロードされていない場合に通知を表示
    setTimeout(() => {
        if (!isYTAPIReady) {
            console.warn("YouTube API load timed out or delayed.");
            showNotification(
                "YouTube APIの読み込みに時間がかかっています。ネットワーク接続を確認するか、広告ブロッカーを一時的にオフにしてみてください。", 
                "warning", 
                7000
            );
        }
    }, 7000);
});

function initYouTubePlayer() {
    if (!state.player && state.videoId) {
        loadYouTubeVideo(state.videoId);
    }
}

// 動画入力欄・履歴の3系統同期関数
function syncVideoInputs(url, videoId) {
    if (dom.youtubeUrl) dom.youtubeUrl.value = url || "";
    if (dom.settingsYoutubeUrl) dom.settingsYoutubeUrl.value = url || "";
    if (dom.mobileYoutubeUrl) dom.mobileYoutubeUrl.value = url || "";
    
    if (dom.videoHistorySelect) dom.videoHistorySelect.value = videoId || "";
    if (dom.settingsVideoHistorySelect) dom.settingsVideoHistorySelect.value = videoId || "";
    if (dom.mobileVideoHistorySelect) dom.mobileVideoHistorySelect.value = videoId || "";
}

// 共通動画ロード処理
function triggerVideoLoad(url) {
    if (!url) {
        showNotification("YouTube URL または 動画IDを入力してください。", "warning");
        return;
    }
    const videoId = extractVideoId(url);
    if (!videoId || videoId.length !== 11) {
        showNotification("有効なYouTube URLまたは動画ID（11桁）を入力してください。", "warning");
        return;
    }
    state.videoId = videoId;
    localStorage.setItem("splyza_youtube_url", url);
    localStorage.setItem("splyza_video_id", videoId);
    
    syncVideoInputs(url, videoId);
    
    // 履歴に一時登録 (プレイヤーロード後に正式タイトルに更新)
    addVideoToHistory(videoId, url, `動画: ${videoId}`);
    
    showNotification("動画を読み込んでいます...", "info", 2000);
    loadYouTubeVideo(videoId);
    loadAllData();
}

// 共通動画履歴選択処理
function triggerVideoSelect(videoId) {
    if (!videoId) return;
    
    const historyItem = state.videoHistory.find(item => item.videoId === videoId);
    if (historyItem) {
        state.videoId = videoId;
        localStorage.setItem("splyza_youtube_url", historyItem.url);
        localStorage.setItem("splyza_video_id", videoId);
        
        syncVideoInputs(historyItem.url, videoId);
        
        showNotification("動画を履歴から切り替えています...", "info", 2000);
        loadYouTubeVideo(videoId);
        loadAllData();
    }
}

// 動画履歴の描画
function renderVideoHistorySelect() {
    const selectBoxes = [
        dom.videoHistorySelect,
        dom.settingsVideoHistorySelect,
        dom.mobileVideoHistorySelect
    ].filter(Boolean);
    
    selectBoxes.forEach(selectBox => {
        selectBox.innerHTML = '<option value="">過去の分析動画から選択...</option>';
        state.videoHistory.forEach(item => {
            const opt = document.createElement("option");
            opt.value = item.videoId;
            opt.textContent = item.title;
            if (item.videoId === state.videoId) {
                opt.selected = true;
            }
            selectBox.appendChild(opt);
        });
    });
}

// 過去の動画履歴に新規登録または更新
function addVideoToHistory(videoId, url, title) {
    if (!videoId) return;
    
    const index = state.videoHistory.findIndex(item => item.videoId === videoId);
    const now = new Date().toISOString();
    
    if (index !== -1) {
        state.videoHistory[index].title = title || state.videoHistory[index].title;
        state.videoHistory[index].url = url || state.videoHistory[index].url;
        state.videoHistory[index].lastAccessed = now;
    } else {
        state.videoHistory.push({
            videoId: videoId,
            url: url || `https://www.youtube.com/watch?v=${videoId}`,
            title: title || `動画: ${videoId}`,
            lastAccessed: now
        });
    }
    
    // 最終アクセス日時の降順（新しい順）でソート
    state.videoHistory.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
    
    // 最大30件
    if (state.videoHistory.length > 30) {
        state.videoHistory = state.videoHistory.slice(0, 30);
    }
    
    localStorage.setItem("splyza_video_history", JSON.stringify(state.videoHistory));
    renderVideoHistorySelect();
}

// プレイヤーから動画タイトルを取得して履歴を更新
function updateVideoTitleFromPlayer() {
    if (state.player && state.playerReady && typeof state.player.getVideoData === "function") {
        const videoData = state.player.getVideoData();
        if (videoData && videoData.title) {
            addVideoToHistory(state.videoId, localStorage.getItem("splyza_youtube_url"), videoData.title);
        }
    }
}

// 現在登録されている背番号を取得し、サジェストリストおよびフィルター用の選択肢を自動更新する
function updatePlayerNumberSuggestions() {
    const datalist = document.getElementById("player-number-suggestions");
    const badgesContainer = document.getElementById("player-quick-badges");
    if (!datalist) return;
    
    // 現在のタグデータから登録されている背番号を一意に抽出（半角数字のみであることを前提）
    const numbers = [...new Set(state.tags.map(t => t.playerNumber).filter(Boolean))];
    // 数値の昇順にソート
    numbers.sort((a, b) => parseInt(a) - parseInt(b));
    
    // 1. datalistサジェストの更新
    datalist.innerHTML = "";
    numbers.forEach(num => {
        const opt = document.createElement("option");
        opt.value = num;
        opt.textContent = `#${num}`;
        datalist.appendChild(opt);
    });

    // 2. クイック選択用バッジリストの更新 (これまで入力された番号すべてが常に一覧で並びタップ選択できる)
    if (badgesContainer) {
        badgesContainer.innerHTML = "";
        if (numbers.length > 0) {
            const label = document.createElement("span");
            label.style.fontSize = "10px";
            label.style.color = "var(--text-secondary)";
            label.style.fontWeight = "600";
            label.style.marginRight = "4px";
            label.textContent = "履歴:";
            badgesContainer.appendChild(label);
        }
        
        numbers.forEach(num => {
            const btn = document.createElement("button");
            btn.className = "player-quick-badge-btn";
            btn.style.cssText = `
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                border-radius: 12px;
                padding: 2px 8px;
                font-size: 11px;
                cursor: pointer;
                font-weight: 600;
                transition: var(--transition-smooth);
            `;
            btn.textContent = `#${num}`;
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                if (dom.stampPlayerNumber) {
                    dom.stampPlayerNumber.value = num;
                }
            });
            // ホバー時の輝き効果
            btn.addEventListener("mouseenter", () => {
                btn.style.background = "var(--accent-blue)";
                btn.style.color = "#000";
                btn.style.borderColor = "var(--accent-blue)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(255, 255, 255, 0.05)";
                btn.style.color = "var(--text-primary)";
                btn.style.borderColor = "var(--border-color)";
            });
            badgesContainer.appendChild(btn);
        });
    }
    
    updateFilterPlayerSelect(numbers);
}

// フィルター用のセレクトボックスの選択肢を動的に更新
function updateFilterPlayerSelect(numbers) {
    if (!dom.tagFilterPlayer) return;
    
    const currentValue = state.tagFilterPlayer; // 現在の選択を保護
    
    dom.tagFilterPlayer.innerHTML = `
        <option value="all">すべての選手</option>
        <option value="none">選手指定なし</option>
    `;
    
    numbers.forEach(num => {
        const opt = document.createElement("option");
        opt.value = num;
        opt.textContent = `#${num}`;
        dom.tagFilterPlayer.appendChild(opt);
    });
    
    // 選択状態を復元
    dom.tagFilterPlayer.value = currentValue;
    if (!dom.tagFilterPlayer.value) {
        dom.tagFilterPlayer.value = "all";
        state.tagFilterPlayer = "all";
    }
}


// DOM参照の保持
let dom = {};
function initDOMReferences() {
    dom = {
        youtubeUrl: document.getElementById("youtube-url"),
        loadVideoBtn: document.getElementById("load-video-btn"),
        playPauseBtn: document.getElementById("play-pause-btn"),
        prevFrameBtn: document.getElementById("prev-frame-btn"),
        nextFrameBtn: document.getElementById("next-frame-btn"),
        currentTime: document.getElementById("current-time"),
        totalTime: document.getElementById("total-time"),
        speedSelect: document.getElementById("speed-select"),
        timelineSlider: document.getElementById("timeline-slider"),
        timelineMarkers: document.getElementById("timeline-markers"),
        timelineTicks: document.getElementById("timeline-ticks"),
        videoHistorySelect: document.getElementById("video-history-select"),
        
        // アノテーション
        canvas: document.getElementById("annotation-canvas"),
        brushSize: document.getElementById("brush-size"),
        brushSizeVal: document.getElementById("brush-size-val"),
        undoBtn: document.getElementById("undo-btn"),
        clearBtn: document.getElementById("clear-btn"),
        toolBtns: document.querySelectorAll(".tool-btn"),
        colorDots: document.querySelectorAll(".color-dot"),
        
        // サイドバー
        sidebarTabs: document.querySelectorAll(".sidebar-tab-btn"),
        sidebarContents: document.querySelectorAll(".sidebar-tab-content"),
        quickTagsContainer: document.getElementById("quick-tags-container"),
        newTagName: document.getElementById("new-tag-name"),
        addTagBtn: document.getElementById("add-tag-btn"),
        tagHistoryList: document.getElementById("tag-history-list"),
        chatMessages: document.getElementById("chat-messages"),
        chatMessageInput: document.getElementById("chat-message-input"),
        sendChatBtn: document.getElementById("send-chat-btn"),
        commentAttachTime: document.getElementById("comment-attach-time"),
        commentTimeStamp: document.getElementById("comment-time-stamp"),
        
        // 作戦盤
        courtWrapper: document.getElementById("court-wrapper"),
        clearTacticsDrawings: document.getElementById("clear-tactics-drawings"),
        resetTacticsPieces: document.getElementById("reset-tactics-pieces"),
        courtSvgContainer: document.getElementById("court-svg-container"),
        tacticsCanvas: document.getElementById("tactics-canvas"),
        piecesOverlay: document.getElementById("pieces-overlay"),
        poolTeamA: document.getElementById("pool-team-a"),
        poolTeamB: document.getElementById("pool-team-b"),
        poolObjects: document.getElementById("pool-objects"),
        ttoolBtns: document.querySelectorAll(".ttool-btn"),
        tcolorDots: document.querySelectorAll(".tcolor-dot"),
        
        // 設定モーダル
        settingsModal: document.getElementById("settings-modal"),
        openSettingsBtn: document.getElementById("open-settings-btn"),
        closeSettingsBtn: document.getElementById("close-settings-btn"),
        settingsUsername: document.getElementById("settings-username"),
        fbApiKey: document.getElementById("fb-api-key"),
        fbAuthDomain: document.getElementById("fb-auth-domain"),
        fbProjectId: document.getElementById("fb-project-id"),
        fbAppId: document.getElementById("fb-app-id"),
        saveSettingsBtn: document.getElementById("save-settings-btn"),
        clearSettingsBtn: document.getElementById("clear-settings-btn"),
        userDisplayName: document.getElementById("user-display-name"),
        stampPlayerNumber: document.getElementById("stamp-player-number"),
        tagFilterPlayer: document.getElementById("tag-filter-player"),
        submitTagsBtn: document.getElementById("submit-tags-btn"),
        themeToggleBtn: document.getElementById("theme-toggle-btn"),
        fullscreenBtn: document.getElementById("fullscreen-btn"),
        playerWrapper: document.getElementById("player-wrapper"),
        videoOverlayContainer: document.getElementById("video-overlay-container"),
        videoFullscreenBtnOverlay: document.getElementById("video-fullscreen-btn-overlay"),
        fullscreenToolbar: document.getElementById("fullscreen-toolbar"),
        fsToolBtns: document.querySelectorAll(".fs-tool-btn"),
        fsColorDots: document.querySelectorAll(".fs-color-dot"),
        fsUndoBtn: document.getElementById("fs-undo-btn"),
        fsClearBtn: document.getElementById("fs-clear-btn"),
        fsCloseBtn: document.getElementById("fs-close-btn"),
        fsTriggerBtn: document.getElementById("fs-trigger-btn"),
        fsMinimizeBtn: document.getElementById("fs-minimize-btn"),
        // スマホ用設定モーダル動画ロード
        settingsYoutubeUrl: document.getElementById("settings-youtube-url"),
        settingsLoadVideoBtn: document.getElementById("settings-load-video-btn"),
        settingsVideoHistorySelect: document.getElementById("settings-video-history-select"),
        // スマホメイン画面用動画ロード
        mobileYoutubeUrl: document.getElementById("mobile-youtube-url"),
        mobileLoadVideoBtn: document.getElementById("mobile-load-video-btn"),
        mobileVideoHistorySelect: document.getElementById("mobile-video-history-select")
    };
    
    state.canvas = dom.canvas;
    state.ctx = dom.canvas.getContext("2d");
    state.tacticsCanvas = dom.tacticsCanvas;
    state.tacticsCtx = dom.tacticsCanvas.getContext("2d");
}

// ----------------------------------------------------------------------------
// 3. 設定の読み込みとFirebase初期化
// ----------------------------------------------------------------------------
function loadSettingsFromStorage() {
    // ユーザー名
    const savedName = localStorage.getItem("splyza_username");
    if (savedName) {
        state.username = savedName;
        dom.settingsUsername.value = savedName;
    } else {
        // ランダムなゲスト名を生成
        state.username = "ゲスト_" + Math.floor(1000 + Math.random() * 9000);
        dom.settingsUsername.value = state.username;
    }
    updateUserBadge();

    // 保存された動画情報
    const savedUrl = localStorage.getItem("splyza_youtube_url");
    const savedVideoId = localStorage.getItem("splyza_video_id");
    if (savedUrl) {
        if (dom.youtubeUrl) dom.youtubeUrl.value = savedUrl;
        if (dom.settingsYoutubeUrl) dom.settingsYoutubeUrl.value = savedUrl;
        if (dom.mobileYoutubeUrl) dom.mobileYoutubeUrl.value = savedUrl;
    }
    if (savedVideoId) {
        state.videoId = savedVideoId;
    }

    // 過去の動画履歴の読み込み
    const savedHistory = localStorage.getItem("splyza_video_history");
    if (savedHistory) {
        try {
            state.videoHistory = JSON.parse(savedHistory);
            renderVideoHistorySelect();
        } catch (e) {
            console.error("履歴のロードに失敗しました", e);
        }
    }

    // Firebase構成
    const savedFbConfig = localStorage.getItem("splyza_firebase_config");
    if (savedFbConfig) {
        try {
            state.firebaseConfig = JSON.parse(savedFbConfig);
            dom.fbApiKey.value = state.firebaseConfig.apiKey || "";
            dom.fbAuthDomain.value = state.firebaseConfig.authDomain || "";
            dom.fbProjectId.value = state.firebaseConfig.projectId || "";
            dom.fbAppId.value = state.firebaseConfig.appId || "";
            
            initFirebase(state.firebaseConfig);
        } catch (e) {
            console.error("Firebase設定の読み込みに失敗しました", e);
        }
    }

    // テーマ初期化
    const savedTheme = localStorage.getItem("splyza_theme");
    if (savedTheme === "dark") {
        document.body.classList.remove("light-theme");
        updateThemeToggleIcon(false);
    } else {
        document.body.classList.add("light-theme");
        updateThemeToggleIcon(true);
    }
}

function updateThemeToggleIcon(isLight) {
    if (!dom.themeToggleBtn) return;
    const icon = dom.themeToggleBtn.querySelector("i");
    if (icon) {
        if (isLight) {
            icon.className = "fa-solid fa-moon";
            dom.themeToggleBtn.title = "ダークモードに切り替え";
        } else {
            icon.className = "fa-solid fa-sun";
            dom.themeToggleBtn.title = "ライトモードに切り替え";
        }
    }
}

function initFirebase(config) {
    if (!config || !config.apiKey || !config.projectId) {
        state.isFirebaseEnabled = false;
        return;
    }
    
    try {
        // 既存のアプリがあればクリア
        if (firebase.apps.length > 0) {
            firebase.app().delete();
        }
        
        firebase.initializeApp(config);
        state.db = firebase.firestore();
        state.isFirebaseEnabled = true;
        console.log("Firebase initialized successfully.");
    } catch (e) {
        console.error("Firebaseの初期化に失敗しました", e);
        state.isFirebaseEnabled = false;
    }
}

function updateUserBadge() {
    dom.userDisplayName.innerHTML = `<i class="fa-solid fa-user"></i> ${state.username}`;
    if (state.isFirebaseEnabled) {
        dom.userDisplayName.classList.add("firebase-active");
    } else {
        dom.userDisplayName.classList.remove("firebase-active");
    }
}

function updateUIForFirebaseStatus() {
    updateUserBadge();
    const statusText = state.isFirebaseEnabled ? "クラウド同期中" : "ローカル保存モード";
    console.log(`システムステータス: ${statusText}`);
}

// ----------------------------------------------------------------------------
// 4. データ同期 (Firestore & LocalStorage フォールバック)
// ----------------------------------------------------------------------------
// データ保存
async function saveData(collectionName, docId, data) {
    const videoCollection = `video_${state.videoId}_${collectionName}`;
    const payload = {
        ...data,
        updatedAt: new Date().toISOString()
    };

    if (state.isFirebaseEnabled && state.db) {
        try {
            await state.db.collection(videoCollection).doc(docId).set(payload);
            if (collectionName === "tags") {
                showNotification(`タグ「${data.name}」を保存しました`, "success", 2000);
            }
        } catch (e) {
            console.error("Firebase保存エラー。ローカルに書き込みます", e);
            saveDataLocally(videoCollection, docId, payload);
            showNotification("Firebase保存に失敗しました。ローカルモードで保存しました。", "warning", 3000);
        }
    } else {
        saveDataLocally(videoCollection, docId, payload);
        if (collectionName === "tags") {
            showNotification(`タグ「${data.name}」をローカルに保存しました`, "success", 2000);
        }
    }
}

// データ削除
async function deleteData(collectionName, docId) {
    const videoCollection = `video_${state.videoId}_${collectionName}`;
    
    if (state.isFirebaseEnabled && state.db) {
        try {
            await state.db.collection(videoCollection).doc(docId).delete();
            showNotification("データを削除しました。", "info", 2000);
        } catch (e) {
            console.error("Firebase削除エラー。ローカルから削除します", e);
            deleteDataLocally(videoCollection, docId);
            showNotification("Firebaseからの削除に失敗しました。ローカルから削除しました。", "warning", 3000);
        }
    } else {
        deleteDataLocally(videoCollection, docId);
        showNotification("ローカルデータを削除しました。", "info", 2000);
    }
}

// ローカル保存ヘルパー
function saveDataLocally(collection, docId, payload) {
    let localDb = JSON.parse(localStorage.getItem(collection) || "{}");
    localDb[docId] = payload;
    localStorage.setItem(collection, JSON.stringify(localDb));
    // 同期トリガーを擬似的に引く
    triggerLocalSync(collection);
}

function deleteDataLocally(collection, docId) {
    let localDb = JSON.parse(localStorage.getItem(collection) || "{}");
    delete localDb[docId];
    localStorage.setItem(collection, JSON.stringify(localDb));
    // 同期トリガーを擬似的に引く
    triggerLocalSync(collection);
}

// リアルタイム購読の開始
function startDataSubscriptions() {
    // 既存のリスナーを解除
    state.unsubscribeList.forEach(unsub => unsub());
    state.unsubscribeList = [];

    const collections = ["annotations", "tags", "comments", "tactics"];
    
    if (state.isFirebaseEnabled && state.db) {
        collections.forEach(col => {
            const videoCollection = `video_${state.videoId}_${col}`;
            const unsub = state.db.collection(videoCollection).onSnapshot(snapshot => {
                const items = [];
                snapshot.forEach(doc => {
                    items.push({ id: doc.id, ...doc.data() });
                });
                handleIncomingData(col, items);
            }, err => {
                console.error(`Subscription error for ${col}, falling back to local`, err);
                setupLocalSubscription(col);
            });
            state.unsubscribeList.push(unsub);
        });
    } else {
        // ローカルでの監視セットアップ
        collections.forEach(col => {
            setupLocalSubscription(col);
        });
    }
}

// ローカルの擬似的なサブスクリプション
function setupLocalSubscription(col) {
    const videoCollection = `video_${state.videoId}_${col}`;
    
    // 初回読み込み
    loadLocalData(col, videoCollection);
    
    // イベント監視の設定 (同じタブ内での変更検知用にカスタムイベントを使用)
    const syncHandler = () => loadLocalData(col, videoCollection);
    window.addEventListener(`sync_${videoCollection}`, syncHandler);
    
    // 解除用に登録
    state.unsubscribeList.push(() => {
        window.removeEventListener(`sync_${videoCollection}`, syncHandler);
    });
}

function triggerLocalSync(collection) {
    const event = new CustomEvent(`sync_${collection}`);
    window.dispatchEvent(event);
}

function loadLocalData(col, videoCollection) {
    const localDb = JSON.parse(localStorage.getItem(videoCollection) || "{}");
    const items = Object.keys(localDb).map(key => ({ id: key, ...localDb[key] }));
    handleIncomingData(col, items);
}

// 受信したデータを適切な状態にマッピングしUIを更新
function handleIncomingData(col, items) {
    if (col === "annotations") {
        state.annotations = items;
        renderAnnotationsOnCanvas();
        updateTimelineMarkers();
    } else if (col === "tags") {
        // 再生時間の昇順でソート
        state.tags = items.sort((a, b) => a.time - b.time);
        updatePlayerNumberSuggestions(); // 選手履歴サジェストを更新
        renderTagsList();
        updateTimelineMarkers();
    } else if (col === "comments") {
        // 作成日時の昇順でソート
        state.comments = items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        renderCommentsList();
    } else if (col === "tactics") {
        // tacticsは単一ドキュメント、または複数ドキュメントとして管理。ここでは簡易的にid="board"に集約
        const boardDoc = items.find(item => item.id === "board");
        if (boardDoc) {
            const newPieces = boardDoc.pieces || [];
            const newDrawings = boardDoc.drawings || [];
            
            // 現在のローカル状態と全く同じ内容（移動直後など）であれば無駄な再描画（ドラッグ中DOM消滅）をスキップする
            const piecesChanged = JSON.stringify(state.tacticsPieces) !== JSON.stringify(newPieces);
            const drawingsChanged = JSON.stringify(state.tacticsDrawings) !== JSON.stringify(newDrawings);
            
            if (piecesChanged || drawingsChanged) {
                state.tacticsPieces = newPieces;
                state.tacticsDrawings = newDrawings;
                if (state.isDraggingPiece) {
                    state.pendingTacticsRender = true;
                } else {
                    renderTacticsBoard();
                }
            }
        }
    }
}

function loadAllData() {
    startDataSubscriptions();
}

// ----------------------------------------------------------------------------
// 5. タブ切り替え制御
// ----------------------------------------------------------------------------
function initAppTabs() {
    const tabs = document.querySelectorAll(".header-tabs .tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const targetMode = tab.getAttribute("data-tab");
            state.activeTab = targetMode;
            
            document.querySelectorAll(".app-main .tab-content").forEach(content => {
                content.classList.remove("active");
            });
            document.getElementById(targetMode).classList.add("active");
            
            if (targetMode === "analysis-mode") {
                // YouTubeプレーヤー再開時のリサイズ対応など
                resizeCanvas();
            } else if (targetMode === "tactics-mode") {
                // 作戦盤の読み込みと描画
                initTacticsBoard();
            }
        });
    });

    // サイドバーのタブ切り替え (映像分析モード内)
    dom.sidebarTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            dom.sidebarTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            const targetId = tab.getAttribute("data-sidebar-tab");
            dom.sidebarContents.forEach(content => {
                content.classList.remove("active");
            });
            document.getElementById(targetId).classList.add("active");
        });
    });
}

// ----------------------------------------------------------------------------
// 6. YouTube IFrame Player API 連携
// ----------------------------------------------------------------------------
// YouTube API呼び出し時のグローバルコールバック
window.onYouTubeIframeAPIReady = function() {
    isYTAPIReady = true;
    console.log("YouTube IFrame API Ready");
    if (isDOMReady) {
        initYouTubePlayer();
    }
};

function loadYouTubeVideo(videoId) {
    if (typeof YT === "undefined" || !YT.Player) {
        console.error("YouTube API is not loaded yet.");
        showNotification("YouTube APIがまだ読み込まれていません。ページを再読み込みするか、しばらくお待ちください。", "error");
        return;
    }
    
    if (!videoId) {
        showNotification("無効な動画IDまたはURLです。", "warning");
        return;
    }

    // すでにプレイヤーが存在し、cueVideoByIdが使える場合は動画IDのみを切り替える
    if (state.player && state.playerReady && typeof state.player.cueVideoById === "function") {
        try {
            state.player.cueVideoById(videoId);
            // cueVideoById後、durationの更新を待つ
            setTimeout(() => {
                retryGetDuration();
            }, 500);
            showNotification("動画を切り替えました。", "success");
            return;
        } catch (e) {
            console.warn("cueVideoByIdに失敗しました。再生成します", e);
        }
    }

    // プレイヤーが存在するが、再生成が必要な場合は破棄する
    if (state.player) {
        try {
            state.player.destroy();
        } catch (e) {
            console.error("Player destroy error", e);
        }
        state.player = null;
        state.playerReady = false;
    }

    clearInterval(state.timeTrackerInterval);
    
    // destroyによってyt-player要素がDOMから消滅している可能性が高いため、コンテナ内に再作成する
    const container = document.getElementById("yt-player-container");
    if (!container) {
        console.error("yt-player-container not found in DOM");
        return;
    }
    
    container.innerHTML = '<div id="yt-player"></div>';
    const ytPlayerEl = document.getElementById("yt-player");
    
    try {
        state.player = new YT.Player(ytPlayerEl, {
            height: "100%",
            width: "100%",
            videoId: videoId,
            playerVars: {
                autoplay: 0,
                controls: 1, // YouTube標準コントロールを表示（iframe操作の信頼性を確保するため）
                rel: 0,
                modestbranding: 1,
                fs: 0,
                playsinline: 1,
                origin: window.location.origin
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange
            }
        });
    } catch (err) {
        console.error("Failed to create YT.Player:", err);
        showNotification("YouTubeプレイヤーの作成に失敗しました: " + err.message, "error");
    }
}

function onPlayerReady(event) {
    state.playerReady = true;
    
    // YouTube APIはonReady直後にduration=0を返す場合があるため、リトライで取得する
    retryGetDuration();

    // 定期的なシークバーと時間の更新
    clearInterval(state.timeTrackerInterval);
    state.timeTrackerInterval = setInterval(updatePlaybackProgress, 250);
    
    // Canvasのリサイズを動画アスペクト比に合わせる
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
    // クイックタグボタンのレンダリングを確実に行う（playerReadyになったため）
    renderTagsList();

    // プレイヤーから動画タイトルを取得して履歴を更新
    updateVideoTitleFromPlayer();

    console.log("YouTube Player Ready. Video ID:", state.videoId);
}

// durationの取得をリトライする（YouTube API は準備直後に0を返すことがある）
function retryGetDuration(retries = 10) {
    if (!state.player || !state.playerReady) return;
    const dur = state.player.getDuration();
    if (dur > 0) {
        state.duration = dur;
        dom.totalTime.textContent = formatTime(state.duration);
        dom.timelineSlider.max = state.duration;
        generateTimelineTicks();
        updateTimelineMarkers();
        
        // 動画メタデータ取得完了時にタイトル履歴も更新する
        updateVideoTitleFromPlayer();
    } else if (retries > 0) {
        setTimeout(() => retryGetDuration(retries - 1), 500);
    }
}

function onPlayerStateChange(event) {
    const ytContainer = document.getElementById("yt-player-container");
    if (event.data === YT.PlayerState.PLAYING) {
        dom.playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        // 再生中はアノテーション入力を不可（透過）にする
        state.canvas.classList.remove("drawing-active");
        if (ytContainer) ytContainer.style.pointerEvents = "auto";
    } else {
        dom.playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        // 一時停止中はアノテーションツールがアクティブなら入力を有効にする
        if (state.activeTool) {
            state.canvas.classList.add("drawing-active");
            if (ytContainer) ytContainer.style.pointerEvents = "none"; // iPad等でのタッチ強奪防止
        }
    }
    // 再生状態の変化に伴ってCanvasを再描画
    renderAnnotationsOnCanvas();

    // 再生ステート変化時（読み込み完了や再生開始時など）にタイトルを更新
    updateVideoTitleFromPlayer();
}

function updatePlaybackProgress() {
    if (!state.playerReady || !state.player) return;
    
    const currTime = state.player.getCurrentTime();
    state.playbackTime = currTime;
    
    // シークバーの更新 (ユーザーが操作中でない場合のみ)
    if (document.activeElement !== dom.timelineSlider) {
        dom.timelineSlider.value = currTime;
    }
    
    dom.currentTime.textContent = formatTime(currTime);
    dom.commentTimeStamp.textContent = formatTime(currTime);

    // アノテーションの描画更新
    renderAnnotationsOnCanvas();

    // 動画上のリアルタイムタグ・コメントオーバーレイ表示更新
    updateVideoOverlay(currTime);
}

function updateVideoOverlay(time) {
    if (!dom.videoOverlayContainer) return;
    
    // 表示すべきタグを抽出（打刻時間から5秒間）
    const visibleTags = state.tags.filter(t => time >= t.time && time <= t.time + 5);
    
    // 表示すべきコメントを抽出（タイムスタンプ付きで、打刻時間から5秒間）
    const visibleComments = state.comments.filter(c => 
        c.attachTime !== undefined && c.attachTime !== null && time >= c.attachTime && time <= c.attachTime + 5
    );
    
    // 表示アイテムの構築 (同一打刻タグ内の複数バッジは1つのアイテムに集約)
    const items = [];
    visibleTags.forEach(t => {
        items.push({
            id: `tag_${t.id}`,
            type: "tag",
            badges: t.names || [t.name || ""],
            playerNumber: t.playerNumber ? `#${t.playerNumber}` : "",
            comment: t.comment || ""
        });
    });
    
    visibleComments.forEach(c => {
        items.push({
            id: `comm_${c.id}`,
            type: "comment",
            badge: c.user,
            text: c.content
        });
    });
    
    // チラつき防止（表示すべきアイテムのIDリストに変化がない場合はDOM更新をスキップ）
    const currentIds = items.map(item => item.id).sort().join(",");
    if (state.lastOverlayIds === currentIds) {
        return;
    }
    state.lastOverlayIds = currentIds;
    
    dom.videoOverlayContainer.innerHTML = "";
    
    if (items.length === 0) return;
    
    items.forEach(item => {
        const el = document.createElement("div");
        el.className = "overlay-item";
        
        let contentHtml = "";
        if (item.type === "tag") {
            // タグバッジ群を横並びにする
            let badgesHtml = "";
            item.badges.forEach(b => {
                if (b.trim()) {
                    badgesHtml += `<span class="overlay-badge"><i class="fa-solid fa-tag"></i> ${escapeHTML(b)}</span>`;
                }
            });
            // 背番号バッジ (背番号も独立したバッジ状にする)
            const playerInfo = item.playerNumber ? `<span class="overlay-badge overlay-badge-player" style="color: var(--accent-blue);"><i class="fa-solid fa-user"></i> ${escapeHTML(item.playerNumber)}</span>` : "";
            const commentInfo = item.comment ? `<span class="overlay-comment-text" style="margin-left: 4px;">${escapeHTML(item.comment)}</span>` : "";
            
            contentHtml = `
                ${badgesHtml}
                ${playerInfo}
                ${commentInfo}
            `;
        } else {
            contentHtml = `
                <span class="overlay-badge overlay-badge-comment"><i class="fa-solid fa-comment"></i> ${escapeHTML(item.badge)}</span>
                <span class="overlay-comment">${escapeHTML(item.text)}</span>
            `;
        }
        
        el.innerHTML = contentHtml;
        dom.videoOverlayContainer.appendChild(el);
    });
}

// 時間のフォーマット (MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// URLから動画IDを抽出
function extractVideoId(url) {
    if (!url) return "";
    url = url.trim();
    
    // 1. URLオブジェクトとしてパースを試みる
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === "youtu.be") {
            return urlObj.pathname.slice(1);
        }
        if (urlObj.hostname.includes("youtube.com")) {
            // shorts の場合
            if (urlObj.pathname.startsWith("/shorts/")) {
                return urlObj.pathname.split("/")[2];
            }
            // embed の場合
            if (urlObj.pathname.startsWith("/embed/")) {
                return urlObj.pathname.split("/")[2];
            }
            // 通常のウォッチ URL
            return urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop();
        }
    } catch (e) {
        // URLとして無効な場合はフォールバック
    }

    // 従来の正規表現フォールバック
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

// ----------------------------------------------------------------------------
// 7. アノテーション描き込み機能 (Canvas)
// ----------------------------------------------------------------------------
// キャンバスのカーソルクラスを更新する関数
function updateCanvasToolClass() {
    if (!state.canvas) return;
    // 既存 of tool-* クラスを削除
    state.canvas.className.split(" ").forEach(cls => {
        if (cls.startsWith("tool-")) {
            state.canvas.classList.remove(cls);
        }
    });
    // 新しいツールクラスを追加（activeToolが選択されている場合のみ）
    if (state.activeTool) {
        state.canvas.classList.add(`tool-${state.activeTool}`);
    }
    
    // ツール切り替え時に消しゴム以外のときはプレビュー円を消す
    const eraserCursor = document.getElementById("eraser-cursor");
    if (eraserCursor && state.activeTool !== "eraser") {
        eraserCursor.style.display = "none";
    }
}

// 共通の座標計算関数
function getCanvasMousePos(e, canvas) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function initCanvas() {
    // マウスイベント登録 (PC用)
    state.canvas.addEventListener("mousedown", startDrawing);
    state.canvas.addEventListener("mousemove", draw);
    state.canvas.addEventListener("mouseup", stopDrawing);
    state.canvas.addEventListener("mouseleave", stopDrawing);

    // タッチイベント登録 (iPad・モバイル用、スクロール干渉防止のため passive: false)
    state.canvas.addEventListener("touchstart", startDrawingTouch, { passive: false });
    state.canvas.addEventListener("touchmove", drawTouch, { passive: false });
    state.canvas.addEventListener("touchend", stopDrawing);
    
    // 消しゴム用のカスタム円カーソル表示制御 (マウス用)
    const eraserCursor = document.getElementById("eraser-cursor");
    state.canvas.addEventListener("mousemove", (e) => {
        if (state.activeTool === "eraser" && eraserCursor) {
            const pos = getCanvasMousePos(e, state.canvas);
            const x = pos.x;
            const y = pos.y;
            const size = state.eraserSize * 3; // 消しゴムサイズスライダーの太さの3倍
            eraserCursor.style.width = `${size}px`;
            eraserCursor.style.height = `${size}px`;
            eraserCursor.style.left = `${x}px`;
            eraserCursor.style.top = `${y}px`;
            eraserCursor.style.display = "block";
        } else if (eraserCursor) {
            eraserCursor.style.display = "none";
        }
    });
    state.canvas.addEventListener("mouseleave", () => {
        if (eraserCursor) eraserCursor.style.display = "none";
    });
    state.canvas.addEventListener("mouseenter", (e) => {
        if (state.activeTool === "eraser" && eraserCursor) {
            eraserCursor.style.display = "block";
        }
    });
    
    // 初期カーソル設定
    updateCanvasToolClass();
}

function resizeCanvas() {
    // YouTube埋め込み（動画プレイヤーコンテナ）の表示サイズにキャンバスサイズを正確にフィットさせる
    const container = document.getElementById("yt-player-container");
    if (!container) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    state.canvas.width = width;
    state.canvas.height = height;
    
    // 再描画
    renderAnnotationsOnCanvas();
}

// タッチデバイス用ヘルパー関数 (映像分析用)
function startDrawingTouch(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        startDrawing({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }
}

function drawTouch(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        draw({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }
}

// 描画開始
function startDrawing(e) {
    if (state.player && state.player.getPlayerState() === YT.PlayerState.PLAYING) {
        // 動画再生中は描画させず、一時停止する
        state.player.pauseVideo();
        return;
    }

    state.isDrawing = true;
    const pos = getCanvasMousePos(e, state.canvas);
    state.startX = pos.x;
    state.startY = pos.y;

    state.currentDrawingObj = {
        tool: state.activeTool,
        color: state.currentColor,
        size: state.activeTool === "eraser" ? state.eraserSize : state.brushSize,
        points: [{ x: state.startX, y: state.startY }]
    };
}

// 描画中
function draw(e) {
    if (!state.isDrawing || !state.currentDrawingObj) return;

    const pos = getCanvasMousePos(e, state.canvas);
    const curX = pos.x;
    const curY = pos.y;

    // 現在のフレームキャンバスを一度リセットして再描画
    renderAnnotationsOnCanvas();

    state.ctx.strokeStyle = state.currentColor;
    state.ctx.fillStyle = state.currentColor;
    state.ctx.lineWidth = state.brushSize;
    state.ctx.lineCap = "round";
    state.ctx.lineJoin = "round";

    if (state.activeTool === "pen") {
        state.currentDrawingObj.points.push({ x: curX, y: curY });
        drawPenPath(state.currentDrawingObj.points);
    } else if (state.activeTool === "eraser") {
        state.currentDrawingObj.points.push({ x: curX, y: curY });
        state.ctx.globalCompositeOperation = "destination-out";
        state.ctx.strokeStyle = "rgba(0,0,0,1)";
        state.ctx.lineWidth = state.eraserSize * 3; // 消しゴムサイズに合わせて消す
        drawPenPath(state.currentDrawingObj.points);
        state.ctx.globalCompositeOperation = "source-over";
    } else if (state.activeTool === "arrow") {
        drawArrow(state.startX, state.startY, curX, curY);
    } else if (state.activeTool === "rect") {
        state.ctx.beginPath();
        state.ctx.rect(state.startX, state.startY, curX - state.startX, curY - state.startY);
        state.ctx.stroke();
    } else if (state.activeTool === "circle") {
        const radius = Math.sqrt(Math.pow(curX - state.startX, 2) + Math.pow(curY - state.startY, 2));
        state.ctx.beginPath();
        state.ctx.arc(state.startX, state.startY, radius, 0, 2 * Math.PI);
        state.ctx.stroke();
    }
}

// 描画終了
function stopDrawing(e) {
    if (!state.isDrawing || !state.currentDrawingObj) return;
    state.isDrawing = false;

    const pos = getCanvasMousePos(e, state.canvas);
    const endX = pos.x;
    const endY = pos.y;

    if (state.activeTool === "text") {
        const text = prompt("アノテーションテキストを入力してください:");
        if (text) {
            state.currentDrawingObj.text = text;
            state.currentDrawingObj.points = [{ x: state.startX, y: state.startY }];
            saveCurrentAnnotation();
        }
    } else {
        // 矢印や図形の場合、終点をpointsに追加して保存
        if (state.activeTool !== "pen") {
            state.currentDrawingObj.points.push({ x: endX, y: endY });
        }
        
        // 最小限のドラッグ距離を担保 (誤クリック排除)
        const pathLength = state.currentDrawingObj.points.length;
        if ((state.activeTool === "pen" || state.activeTool === "eraser") && pathLength < 2) {
            state.currentDrawingObj = null;
            return;
        }

        saveCurrentAnnotation();
    }
}

// アノテーションの保存
function saveCurrentAnnotation() {
    if (!state.currentDrawingObj) return;

    const id = "ann_" + Date.now();
    // 描画データをCanvasに対する相対比率(0〜1)に正規化して保存（異なる画面サイズでも正しく描画できるようにするため）
    const normPoints = state.currentDrawingObj.points.map(p => ({
        x: p.x / state.canvas.width,
        y: p.y / state.canvas.height
    }));

    const annotation = {
        id: id,
        time: state.playbackTime,
        tool: state.currentDrawingObj.tool,
        color: state.currentDrawingObj.color,
        size: state.currentDrawingObj.tool === "eraser" ? state.currentDrawingObj.size * 3 : state.currentDrawingObj.size,
        points: normPoints,
        text: state.currentDrawingObj.text || "",
        user: state.username
    };

    saveData("annotations", id, annotation);
    state.currentDrawingObj = null;
}

// キャンバス上へのアノテーションの全レンダリング
function renderAnnotationsOnCanvas() {
    if (!state.ctx) return;
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

    // 再生中かつアノテーション表示条件
    // アノテーション打刻時間から前後1.5秒以内のアノテーションを描画する
    const visibleAnnotations = state.annotations.filter(ann => {
        return Math.abs(state.playbackTime - ann.time) <= 1.5;
    });

    visibleAnnotations.forEach(ann => {
        if (ann.tool === "eraser") {
            state.ctx.globalCompositeOperation = "destination-out";
            state.ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
            state.ctx.globalCompositeOperation = "source-over";
            state.ctx.strokeStyle = ann.color;
            state.ctx.fillStyle = ann.color;
        }
        state.ctx.lineWidth = ann.size;
        state.ctx.lineCap = "round";
        state.ctx.lineJoin = "round";

        // 比率から実際ピクセル座標に変換
        const pxPoints = ann.points.map(p => ({
            x: p.x * state.canvas.width,
            y: p.y * state.canvas.height
        }));

        if (ann.tool === "pen" || ann.tool === "eraser") {
            drawPenPath(pxPoints);
        } else if (ann.tool === "arrow") {
            if (pxPoints.length >= 2) {
                drawArrow(pxPoints[0].x, pxPoints[0].y, pxPoints[1].x, pxPoints[1].y);
            }
        } else if (ann.tool === "rect") {
            if (pxPoints.length >= 2) {
                state.ctx.beginPath();
                state.ctx.rect(pxPoints[0].x, pxPoints[0].y, pxPoints[1].x - pxPoints[0].x, pxPoints[1].y - pxPoints[0].y);
                state.ctx.stroke();
            }
        } else if (ann.tool === "circle") {
            if (pxPoints.length >= 2) {
                const radius = Math.sqrt(Math.pow(pxPoints[1].x - pxPoints[0].x, 2) + Math.pow(pxPoints[1].y - pxPoints[0].y, 2));
                state.ctx.beginPath();
                state.ctx.arc(pxPoints[0].x, pxPoints[0].y, radius, 0, 2 * Math.PI);
                state.ctx.stroke();
            }
        } else if (ann.tool === "text") {
            if (pxPoints.length >= 1) {
                state.ctx.font = `${Math.max(14, ann.size * 3.5)}px Noto Sans JP, sans-serif`;
                // テキストの背景を描く
                const textWidth = state.ctx.measureText(ann.text).width;
                state.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                state.ctx.fillRect(pxPoints[0].x - 5, pxPoints[0].y - 20, textWidth + 10, 26);
                
                state.ctx.fillStyle = ann.color;
                state.ctx.fillText(ann.text, pxPoints[0].x, pxPoints[0].y);
            }
        }

        // 元に戻す
        if (ann.tool === "eraser") {
            state.ctx.globalCompositeOperation = "source-over";
        }
    });
}

// ペンパスの描画
function drawPenPath(points) {
    if (points.length < 2) return;
    state.ctx.beginPath();
    state.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        state.ctx.lineTo(points[i].x, points[i].y);
    }
    state.ctx.stroke();
}

// 矢印の描画
function drawArrow(fromx, fromy, tox, toy) {
    const headlen = state.brushSize * 3; // 矢印の頭の長さ
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);

    state.ctx.beginPath();
    state.ctx.moveTo(fromx, fromy);
    state.ctx.lineTo(tox, toy);
    state.ctx.stroke();

    state.ctx.beginPath();
    state.ctx.moveTo(tox, toy);
    state.ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    state.ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    state.ctx.closePath();
    state.ctx.fill();
}

// ----------------------------------------------------------------------------
// 8. プレー分類タグ付け機能
// ----------------------------------------------------------------------------
const defaultQuickTags = ["シュート（成功）", "シュート（枠外）", "シュート（セーブ）", "警告", "退場", "ターンオーバー"];

function renderTagsList() {
    // クイック打刻タグボタン
    dom.quickTagsContainer.innerHTML = "";
    state.quickTags.forEach(tagName => {
        const btn = document.createElement("button");
        btn.className = "tag-btn-item";
        if (state.selectedQuickTags.includes(tagName)) {
            btn.classList.add("selected");
        }

        // テキスト表示用のspan
        const textSpan = document.createElement("span");
        textSpan.textContent = tagName;
        btn.appendChild(textSpan);

        // デフォルト以外のカスタムタグには削除バッジ（×）を追加
        const isCustom = !defaultQuickTags.includes(tagName);
        if (isCustom) {
            const removeBadge = document.createElement("span");
            removeBadge.className = "remove-tag-badge";
            removeBadge.innerHTML = "&times;";
            removeBadge.title = "この選択肢を削除";
            
            removeBadge.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation(); // 親ボタンのクリックトグルイベントを防止
                
                if (confirm(`タグの選択肢「${tagName}」をリストから削除しますか？`)) {
                    // 選択肢リストから削除
                    state.quickTags = state.quickTags.filter(t => t !== tagName);
                    // 選択状態からも削除
                    state.selectedQuickTags = state.selectedQuickTags.filter(t => t !== tagName);
                    
                    renderTagsList(); // 再描画
                    showNotification(`タグ「${tagName}」の選択肢を削除しました。`, "info");
                }
            });
            btn.appendChild(removeBadge);
        }

        // ボタンクリックイベント (トグル選択)
        btn.addEventListener("click", () => {
            const idx = state.selectedQuickTags.indexOf(tagName);
            if (idx === -1) {
                state.selectedQuickTags.push(tagName);
                btn.classList.add("selected");
            } else {
                state.selectedQuickTags.splice(idx, 1);
                btn.classList.remove("selected");
            }
        });
        dom.quickTagsContainer.appendChild(btn);
    });

    // 選手による絞り込みの適用
    let filteredTags = state.tags;
    if (state.tagFilterPlayer === "none") {
        filteredTags = state.tags.filter(t => !t.playerNumber);
    } else if (state.tagFilterPlayer !== "all") {
        filteredTags = state.tags.filter(t => t.playerNumber === state.tagFilterPlayer);
    }

    // 打刻履歴
    dom.tagHistoryList.innerHTML = "";
    if (filteredTags.length === 0) {
        dom.tagHistoryList.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:12px;">該当するタグがありません。</div>`;
        return;
    }

    filteredTags.forEach(tag => {
        const card = document.createElement("div");
        card.className = "tag-record-card";
        
        let playerBadgeHtml = "";
        if (tag.playerNumber) {
            playerBadgeHtml = `<span class="tag-record-player-badge" style="background: rgba(0, 210, 255, 0.15); color: var(--accent-blue); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px;">#${tag.playerNumber}</span>`;
        }

        // タグ名のバッジ群を生成
        let tagsHtml = "";
        if (tag.names && Array.isArray(tag.names)) {
            tag.names.forEach(n => {
                tagsHtml += `<span class="tag-record-title" style="margin-right: 4px;">${n}</span>`;
            });
        } else {
            // 互換性フォールバック（カンマ区切りの文字列を分割して表示）
            const parts = (tag.name || "").split(", ");
            parts.forEach(n => {
                if (n.trim()) {
                    tagsHtml += `<span class="tag-record-title" style="margin-right: 4px;">${n}</span>`;
                }
            });
        }

        card.innerHTML = `
            <div class="tag-record-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                    ${tagsHtml}
                    ${playerBadgeHtml}
                </div>
                <span class="tag-record-time" data-time="${tag.time}" style="font-size: 11px; color: var(--accent-cyan); font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-play"></i> ${formatTime(tag.time)}
                </span>
            </div>
            <div class="tag-record-body" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span style="font-size: 11px; color: var(--text-secondary); font-weight: bold;">#</span>
                <input type="text" class="tag-record-player-input" value="${tag.playerNumber || ""}" placeholder="なし" style="width: 45px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); font-size: 11px; border-radius: 4px; padding: 2px 4px; outline: none; text-align: center; height: 24px;" title="背番号を変更">
                <input type="text" class="tag-record-comment" value="${tag.comment || ""}" placeholder="メモ・分析コメントを入力..." style="flex:1; min-width:120px; background: transparent; border: none; outline: none; font-size: 12px; color: var(--text-primary);">
                <span style="font-size: 10px; color:var(--text-muted)">by ${tag.user || "ゲスト"}</span>
                <button class="tag-delete-btn" title="タグ削除" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;

        // イベント設定
        card.querySelector(".tag-record-time").addEventListener("click", () => {
            seekVideoTo(tag.time);
        });

        // 背番号変更 (半角数字に強制制限)
        const playerInput = card.querySelector(".tag-record-player-input");
        playerInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248)).replace(/[^0-9]/g, "");
        });
        playerInput.addEventListener("change", (e) => {
            saveData("tags", tag.id, {
                ...tag,
                playerNumber: e.target.value
            });
        });

        // コメント変更
        const commentInput = card.querySelector(".tag-record-comment");
        commentInput.addEventListener("change", (e) => {
            saveData("tags", tag.id, {
                ...tag,
                comment: e.target.value
            });
        });

        // 削除
        card.querySelector(".tag-delete-btn").addEventListener("click", () => {
            if (confirm(`タグ「${tag.name}」を削除しますか？`)) {
                deleteData("tags", tag.id);
            }
        });

        dom.tagHistoryList.appendChild(card);
    });
}

function triggerTagStamp(tagName) {
    // プレイヤー未準備でもタグ打刻を許可する（時間は現在の playbackTime、未再生時は 0）
    const playerNum = dom.stampPlayerNumber ? dom.stampPlayerNumber.value : "";
    
    const id = "tag_" + Date.now();
    const newTag = {
        id: id,
        time: state.playbackTime,
        name: tagName,
        names: [tagName],
        playerNumber: playerNum, // 背番号を追加
        comment: "",
        user: state.username
    };

    saveData("tags", id, newTag);
}

// ----------------------------------------------------------------------------
// 9. チャット・コメントディスカッション機能
// ----------------------------------------------------------------------------
function renderCommentsList() {
    dom.chatMessages.innerHTML = "";
    
    if (state.comments.length === 0) {
        dom.chatMessages.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:12px;">コメントがありません。タイムタグ付きのメッセージでディスカッションを始めましょう！</div>`;
        return;
    }

    state.comments.forEach(msg => {
        const isMine = msg.user === state.username;
        const bubble = document.createElement("div");
        bubble.className = `chat-message-bubble ${isMine ? "mine" : ""}`;
        
        let timeBadgeHtml = "";
        if (msg.attachTime !== undefined && msg.attachTime !== null) {
            timeBadgeHtml = `<span class="chat-msg-time-badge" data-time="${msg.attachTime}"><i class="fa-solid fa-clock"></i> ${formatTime(msg.attachTime)}</span>`;
        }

        // 誰のメッセージでも削除ボタンを表示、自分なら編集ボタンも表示
        const deleteBtnHtml = `<button class="chat-msg-delete-btn" title="メッセージを削除"><i class="fa-solid fa-trash-can"></i></button>`;
        const editBtnHtml = isMine ? `<button class="chat-msg-edit-btn" title="メッセージを編集"><i class="fa-solid fa-pen"></i></button>` : "";
        const editedTagHtml = msg.edited ? `<span class="chat-msg-edited-tag">（編集済み）</span>` : "";

        bubble.innerHTML = `
            <div class="chat-msg-meta">
                <strong>${msg.user}</strong>
                ${timeBadgeHtml}
                ${editedTagHtml}
            </div>
            <div class="chat-msg-content">
                <span class="chat-msg-text-span">${escapeHTML(msg.content)}</span>
                ${editBtnHtml}
                ${deleteBtnHtml}
            </div>
        `;

        if (msg.attachTime !== undefined && msg.attachTime !== null) {
            bubble.querySelector(".chat-msg-time-badge").addEventListener("click", () => {
                seekVideoTo(msg.attachTime);
            });
        }

        // 誰でも削除可能なイベントリスナーをバインド
        bubble.querySelector(".chat-msg-delete-btn").addEventListener("click", () => {
            if (confirm("このメッセージを削除しますか？")) {
                deleteData("comments", msg.id);
            }
        });

        // 自分自身のメッセージ編集用のイベントリスナーをバインド
        if (isMine) {
            const editBtn = bubble.querySelector(".chat-msg-edit-btn");
            if (editBtn) {
                editBtn.addEventListener("click", () => {
                    enterEditMode(msg, bubble);
                });
            }
        }

        dom.chatMessages.appendChild(bubble);
    });

    // スクロールを最下部に
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function enterEditMode(msg, bubbleEl) {
    const contentEl = bubbleEl.querySelector(".chat-msg-content");
    if (!contentEl) return;
    
    // すでに編集モードなら何もしない
    if (contentEl.querySelector(".chat-edit-container")) return;
    
    const originalContent = msg.content;
    
    contentEl.innerHTML = `
        <div class="chat-edit-container">
            <textarea class="chat-edit-input">${originalContent}</textarea>
            <div class="chat-edit-actions">
                <button class="btn-mini btn-mini-save">保存</button>
                <button class="btn-mini btn-mini-cancel">キャンセル</button>
            </div>
        </div>
    `;
    
    const textarea = contentEl.querySelector(".chat-edit-input");
    textarea.focus();
    // カーソルをテキストの最後に移動
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // 保存ボタンイベント
    contentEl.querySelector(".btn-mini-save").addEventListener("click", async () => {
        const newText = textarea.value.trim();
        if (!newText) {
            showNotification("コメントを入力してください。", "warning");
            return;
        }
        
        if (newText === originalContent) {
            renderCommentsList();
            return;
        }
        
        const updatedMsg = {
            ...msg,
            content: newText,
            edited: true
        };
        
        await saveData("comments", msg.id, updatedMsg);
        showNotification("コメントを更新しました。", "success");
    });
    
    // キャンセルボタンイベント
    contentEl.querySelector(".btn-mini-cancel").addEventListener("click", () => {
        renderCommentsList();
    });
}

function sendChatMessage() {
    const text = dom.chatMessageInput.value.trim();
    if (!text) return;

    const id = "msg_" + Date.now();
    const payload = {
        id: id,
        content: text,
        user: state.username,
        timestamp: new Date().toISOString()
    };

    if (dom.commentAttachTime.checked && state.playerReady) {
        payload.attachTime = state.playbackTime;
    }

    saveData("comments", id, payload);
    dom.chatMessageInput.value = "";
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ----------------------------------------------------------------------------
// 10. タイムラインマーカー表示
// ----------------------------------------------------------------------------
function generateTimelineTicks() {
    dom.timelineTicks.innerHTML = "";
    if (state.duration <= 0) return;
    
    // 5〜10個の目盛りを打つ
    const tickInterval = Math.max(5, Math.ceil(state.duration / 10));
    for (let t = 0; t <= state.duration; t += tickInterval) {
        const percent = (t / state.duration) * 100;
        const tick = document.createElement("span");
        tick.style.left = `${percent}%`;
        tick.style.position = "absolute";
        tick.style.transform = "translateX(-50%)";
        tick.textContent = formatTime(t);
        dom.timelineTicks.appendChild(tick);
    }
}

function updateTimelineMarkers() {
    dom.timelineMarkers.innerHTML = "";
    if (state.duration <= 0) return;

    // タグマーカー
    state.tags.forEach(tag => {
        const percent = (tag.time / state.duration) * 100;
        const marker = document.createElement("div");
        marker.className = "timeline-marker type-tag";
        marker.style.left = `${percent}%`;
        marker.title = `${tag.name}: ${formatTime(tag.time)}`;
        marker.addEventListener("click", () => seekVideoTo(tag.time));
        dom.timelineMarkers.appendChild(marker);
    });

    // アノテーションマーカー (重複時間は集約)
    const annTimes = [...new Set(state.annotations.map(ann => Math.floor(ann.time)))];
    annTimes.forEach(time => {
        const percent = (time / state.duration) * 100;
        const marker = document.createElement("div");
        marker.className = "timeline-marker type-annotation";
        marker.style.left = `${percent}%`;
        marker.title = `描き込み: ${formatTime(time)}`;
        marker.addEventListener("click", () => seekVideoTo(time));
        dom.timelineMarkers.appendChild(marker);
    });
}

function seekVideoTo(time) {
    if (state.playerReady && state.player) {
        state.player.seekTo(time, true);
        if (state.player.getPlayerState() !== YT.PlayerState.PLAYING) {
            // シーク後に一時停止状態なら描き込みを即座に表示
            state.playbackTime = time;
            renderAnnotationsOnCanvas();
        }
    }
}

// ----------------------------------------------------------------------------
// 11. 作戦盤 (Tactics Board)
// ----------------------------------------------------------------------------
function initTacticsBoard() {
    renderTacticsCourtSVG();
    initTacticsPiecesPool();
    resizeTacticsCanvas();
    renderTacticsBoard();
}

function resizeTacticsCanvas() {
    const wrapper = dom.courtWrapper;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    dom.tacticsCanvas.width = rect.width;
    dom.tacticsCanvas.height = rect.height;
    renderTacticsBoard();
}

// 各コートのSVGを生成して埋め込む
function renderTacticsCourtSVG() {
    // ハンドボールコート専用に高精細SVGを生成
    const svgContent = `
        <svg viewBox="0 0 100 54" width="100%" height="100%">
            <!-- 外枠・背景 -->
            <rect width="100" height="54" fill="#0c121f" rx="6" />
            <rect x="4" y="4" width="92" height="46" fill="#152238" rx="2" />
            
            <!-- ゴールエリア（6m）の塗りつぶし -->
            <path d="M 4 9.75 A 13.8 13.8 0 0 1 17.8 23.55 L 17.8 30.45 A 13.8 13.8 0 0 1 4 44.25 Z" fill="#1c2f4e" />
            <path d="M 96 9.75 A 13.8 13.8 0 0 0 82.2 23.55 L 82.2 30.45 A 13.8 13.8 0 0 0 96 44.25 Z" fill="#1c2f4e" />
            
            <!-- コート境界線 -->
            <rect x="4" y="4" width="92" height="46" fill="none" stroke="#ffffff" stroke-width="0.8" />
            
            <!-- センターライン & センターサークル -->
            <line x1="50" y1="4" x2="50" y2="50" stroke="#ffffff" stroke-width="0.8" />
            <circle cx="50" cy="27" r="3.45" fill="none" stroke="#ffffff" stroke-width="0.8" />
            <circle cx="50" cy="27" r="0.8" fill="#ffffff" />
            
            <!-- ゴールエリアライン（6m線） -->
            <path d="M 4 9.75 A 13.8 13.8 0 0 1 17.8 23.55 L 17.8 30.45 A 13.8 13.8 0 0 1 4 44.25" fill="none" stroke="#ffffff" stroke-width="0.8" />
            <path d="M 96 9.75 A 13.8 13.8 0 0 0 82.2 23.55 L 82.2 30.45 A 13.8 13.8 0 0 0 96 44.25" fill="none" stroke="#ffffff" stroke-width="0.8" />
            
            <!-- フリースローライン（9m線 - 破線） -->
            <path d="M 4 2.85 A 20.7 20.7 0 0 1 24.7 23.55 L 24.7 30.45 A 20.7 20.7 0 0 1 4 51.15" fill="none" stroke="#ffa502" stroke-width="0.8" stroke-dasharray="2,1.5" />
            <path d="M 96 2.85 A 20.7 20.7 0 0 0 75.3 23.55 L 75.3 30.45 A 20.7 20.7 0 0 0 96 51.15" fill="none" stroke="#ffa502" stroke-width="0.8" stroke-dasharray="2,1.5" />
            
            <!-- 7mライン（ペナルティライン） -->
            <line x1="20.1" y1="25.85" x2="20.1" y2="28.15" stroke="#ffffff" stroke-width="1.2" />
            <line x1="79.9" y1="25.85" x2="79.9" y2="28.15" stroke="#ffffff" stroke-width="1.2" />
            
            <!-- 4mライン（GK制限ライン） -->
            <line x1="13.2" y1="26.3" x2="13.2" y2="27.7" stroke="#ffffff" stroke-width="1.0" />
            <line x1="86.8" y1="26.3" x2="86.8" y2="27.7" stroke="#ffffff" stroke-width="1.0" />
            
            <!-- ゴールポスト（枠 - 黒塗りつぶし） -->
            <rect x="1.5" y="23.55" width="2.5" height="6.9" fill="#000000" stroke="#ffffff" stroke-width="0.8" />
            <rect x="96" y="23.55" width="2.5" height="6.9" fill="#000000" stroke="#ffffff" stroke-width="0.8" />
            
            <!-- 交代線（サブスティテューションライン） -->
            <line x1="39.65" y1="3.5" x2="39.65" y2="4.5" stroke="#ffffff" stroke-width="0.8" />
            <line x1="60.35" y1="3.5" x2="60.35" y2="4.5" stroke="#ffffff" stroke-width="0.8" />
            <line x1="39.65" y1="49.5" x2="39.65" y2="50.5" stroke="#ffffff" stroke-width="0.8" />
            <line x1="60.35" y1="49.5" x2="60.35" y2="50.5" stroke="#ffffff" stroke-width="0.8" />
        </svg>
    `;
    dom.courtSvgContainer.innerHTML = svgContent;
}

// 駒生成プール
function initTacticsPiecesPool() {
    dom.poolTeamA.innerHTML = "";
    dom.poolTeamB.innerHTML = "";
    
    // チームA
    for (let i = 1; i <= 11; i++) {
        const piece = document.createElement("div");
        piece.className = "draggable-piece team-a";
        piece.dataset.team = "team-a";
        piece.dataset.number = i;
        piece.draggable = true;
        piece.textContent = i;
        dom.poolTeamA.appendChild(piece);
    }
    
    // チームB
    for (let i = 1; i <= 11; i++) {
        const piece = document.createElement("div");
        piece.className = "draggable-piece team-b";
        piece.dataset.team = "team-b";
        piece.dataset.number = i;
        piece.draggable = true;
        piece.textContent = i;
        dom.poolTeamB.appendChild(piece);
    }
}

// ドラッグ＆ドロップ登録 (HTML5 Drag and Drop API)
function initDragAndDrop() {
    const poolContainer = document.querySelector(".piece-generator-section");
    const dropZone = dom.courtWrapper;
    const tacticsCanvas = dom.tacticsCanvas;
    const piecesOverlay = dom.piecesOverlay;

    // プールからのドラッグ開始
    poolContainer.addEventListener("dragstart", (e) => {
        const piece = e.target.closest(".draggable-piece");
        if (piece) {
            state.isDraggingPiece = true; // ドラッグ中フラグON
            e.dataTransfer.setData("text/plain", JSON.stringify({
                source: "pool",
                team: piece.dataset.team,
                number: piece.dataset.number || ""
            }));
            e.dataTransfer.effectAllowed = "copyMove";
        }
    });

    // プールからのドラッグ終了（dragend）
    poolContainer.addEventListener("dragend", () => {
        state.isDraggingPiece = false;
        if (state.pendingTacticsRender) {
            state.pendingTacticsRender = false;
            renderTacticsBoard();
        }
    });

    // ドロップ可能領域へのドラッグ進入（親のドロップ領域のみでイベントを受信）
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    dropZone.addEventListener("dragover", handleDragOver);

    // ドロップ処理
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation(); // イベントのバブリングを防止して二重登録による複数駒の生成を防ぐ
        const rect = dropZone.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width; // 0〜1で正規化
        const y = (e.clientY - rect.top) / rect.height;

        try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"));
            
            if (data.source === "pool") {
                // 新規駒追加
                const newPiece = {
                    id: "p_" + Date.now(),
                    team: data.team,
                    number: data.number,
                    x: x,
                    y: y
                };
                state.tacticsPieces.push(newPiece);
                saveTacticsData();
            } else if (data.source === "court") {
                // 既存駒の移動
                const pieceIndex = state.tacticsPieces.findIndex(p => p.id === data.id);
                if (pieceIndex !== -1) {
                    state.tacticsPieces[pieceIndex].x = x;
                    state.tacticsPieces[pieceIndex].y = y;
                    saveTacticsData();
                }
            }
        } catch (err) {
            console.error("Drop error", err);
        }
    };

    dropZone.addEventListener("drop", handleDrop);
}

// 作戦盤データの保存
function saveTacticsData() {
    const payload = {
        pieces: state.tacticsPieces,
        drawings: state.tacticsDrawings
    };
    saveData("tactics", "board", payload);
    // 自分自身の変更なので、ドラッグセッションの完了を待ってから再描画する
    setTimeout(() => {
        if (!state.isDraggingPiece) {
            renderTacticsBoard();
        } else {
            state.pendingTacticsRender = true;
        }
    }, 50);
}

// コート上の駒および手書き線のレンダリング
function renderTacticsBoard() {
    // 1. 駒の描画更新
    dom.piecesOverlay.innerHTML = "";
    state.tacticsPieces.forEach(piece => {
        const el = document.createElement("div");
        el.className = `court-piece ${piece.team}`;
        el.style.left = `${piece.x * 100}%`;
        el.style.top = `${piece.y * 100}%`;
        el.setAttribute("draggable", "true"); // draggable属性を確実に設定
        
        if (piece.team === "ball") {
            el.innerHTML = `<i class="fa-solid fa-volleyball"></i>`;
        } else {
            el.textContent = piece.number;
        }

        // ドラッグ開始（既存駒の移動用）
        el.addEventListener("dragstart", (e) => {
            state.isDraggingPiece = true; // ドラッグ中フラグON
            e.dataTransfer.setData("text/plain", JSON.stringify({
                source: "court",
                id: piece.id
            }));
            e.dataTransfer.effectAllowed = "copyMove";
            // ドラッグ開始直後に透明度を下げる
            setTimeout(() => el.style.opacity = "0.5", 0);
        });

        el.addEventListener("dragend", () => {
            el.style.opacity = "1";
            state.isDraggingPiece = false; // ドラッグ中フラグOFF
            // 保留されていた再描画要求があれば実行
            if (state.pendingTacticsRender) {
                state.pendingTacticsRender = false;
                renderTacticsBoard();
            }
        });

        // 削除ボタン
        const delBtn = document.createElement("div");
        delBtn.className = "delete-piece-badge";
        delBtn.innerHTML = "&times;";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.tacticsPieces = state.tacticsPieces.filter(p => p.id !== piece.id);
            saveTacticsData();
        });
        el.appendChild(delBtn);

        dom.piecesOverlay.appendChild(el);
    });

    // 2. 作戦用手書き線の描画更新
    if (!state.tacticsCtx) return;
    state.tacticsCtx.clearRect(0, 0, dom.tacticsCanvas.width, dom.tacticsCanvas.height);
    
    state.tacticsDrawings.forEach(drawing => {
        if (drawing.tool === "eraser") {
            state.tacticsCtx.globalCompositeOperation = "destination-out";
            state.tacticsCtx.strokeStyle = "rgba(0,0,0,1)";
            state.tacticsCtx.lineWidth = 24; // 消しゴムは 24
        } else {
            state.tacticsCtx.globalCompositeOperation = "source-over";
            state.tacticsCtx.strokeStyle = drawing.color;
            state.tacticsCtx.lineWidth = 4; // ペンは 4
        }
        state.tacticsCtx.lineCap = "round";
        state.tacticsCtx.lineJoin = "round";

        const pxPoints = drawing.points.map(p => ({
            x: p.x * dom.tacticsCanvas.width,
            y: p.y * dom.tacticsCanvas.height
        }));

        if (pxPoints.length < 2) return;
        state.tacticsCtx.beginPath();
        state.tacticsCtx.moveTo(pxPoints[0].x, pxPoints[0].y);
        for (let i = 1; i < pxPoints.length; i++) {
            state.tacticsCtx.lineTo(pxPoints[i].x, pxPoints[i].y);
        }
        state.tacticsCtx.stroke();

        if (drawing.tool === "eraser") {
            state.tacticsCtx.globalCompositeOperation = "source-over";
        }
    });
}

// 作戦盤キャンバスのカーソルクラスを更新する関数
function updateTacticsCanvasToolClass() {
    if (!state.tacticsCanvas) return;
    state.tacticsCanvas.className.split(" ").forEach(cls => {
        if (cls.startsWith("ttool-")) {
            state.tacticsCanvas.classList.remove(cls);
        }
    });
    state.tacticsCanvas.classList.add(`ttool-${state.activeTacticsTool}`);
    
    // ツール切り替え時に消しゴム以外のときはプレビュー円を消す
    const tacticsEraserCursor = document.getElementById("tactics-eraser-cursor");
    if (tacticsEraserCursor && state.activeTacticsTool !== "eraser") {
        tacticsEraserCursor.style.display = "none";
    }
}

// 作戦盤での手書き機能
function initTacticsCanvas() {
    dom.tacticsCanvas.addEventListener("mousedown", startTacticsDraw);
    dom.tacticsCanvas.addEventListener("mousemove", drawTacticsLine);
    dom.tacticsCanvas.addEventListener("mouseup", stopTacticsDraw);
    dom.tacticsCanvas.addEventListener("mouseleave", stopTacticsDraw);

    // タッチイベント登録 (iPad・モバイル用、スクロール干渉防止のため passive: false)
    dom.tacticsCanvas.addEventListener("touchstart", startTacticsDrawTouch, { passive: false });
    dom.tacticsCanvas.addEventListener("touchmove", drawTacticsLineTouch, { passive: false });
    dom.tacticsCanvas.addEventListener("touchend", stopTacticsDraw);
    
    // 消しゴム用のカスタム円カーソル表示制御（作戦盤用は24px固定、マウス用）
    const tacticsEraserCursor = document.getElementById("tactics-eraser-cursor");
    dom.tacticsCanvas.addEventListener("mousemove", (e) => {
        if (state.activeTacticsTool === "eraser" && tacticsEraserCursor) {
            const rect = dom.tacticsCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const size = 24;
            tacticsEraserCursor.style.width = `${size}px`;
            tacticsEraserCursor.style.height = `${size}px`;
            tacticsEraserCursor.style.left = `${x}px`;
            tacticsEraserCursor.style.top = `${y}px`;
            tacticsEraserCursor.style.display = "block";
        } else if (tacticsEraserCursor) {
            tacticsEraserCursor.style.display = "none";
        }
    });
    dom.tacticsCanvas.addEventListener("mouseleave", () => {
        if (tacticsEraserCursor) tacticsEraserCursor.style.display = "none";
    });
    dom.tacticsCanvas.addEventListener("mouseenter", (e) => {
        if (state.activeTacticsTool === "eraser" && tacticsEraserCursor) {
            tacticsEraserCursor.style.display = "block";
        }
    });
    
    // ウィンドウリサイズ時にもキャンバスサイズをフィットさせる
    window.addEventListener("resize", resizeTacticsCanvas);

    // iPad等での透過バグ対策：一番上にあるpiecesOverlayのタッチイベントを検知し、駒以外のタッチはCanvasの描画処理へ転送する
    dom.piecesOverlay.addEventListener("touchstart", (e) => {
        const isPiece = e.target.closest(".court-piece");
        if (!isPiece && state.activeTacticsTool) {
            startTacticsDrawTouch(e);
        }
    }, { passive: false });

    dom.piecesOverlay.addEventListener("touchmove", (e) => {
        const isPiece = e.target.closest(".court-piece");
        if (!isPiece && state.isTacticsDrawing) {
            drawTacticsLineTouch(e);
        }
    }, { passive: false });

    dom.piecesOverlay.addEventListener("touchend", (e) => {
        if (state.isTacticsDrawing) {
            stopTacticsDraw();
        }
    });
    
    // 初期カーソル設定
    updateTacticsCanvasToolClass();
}

// タッチデバイス用ヘルパー関数 (作戦盤用)
function startTacticsDrawTouch(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        startTacticsDraw({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }
}

function drawTacticsLineTouch(e) {
    if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        drawTacticsLine({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }
}

function startTacticsDraw(e) {
    state.isTacticsDrawing = true;
    const rect = dom.tacticsCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    state.currentDrawingObj = {
        tool: state.activeTacticsTool,
        color: state.currentTacticsColor,
        points: [{ x, y }]
    };
}

function drawTacticsLine(e) {
    if (!state.isTacticsDrawing || !state.currentDrawingObj) return;

    const rect = dom.tacticsCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    state.currentDrawingObj.points.push({ x, y });
    
    // 一時プレビュー描画
    if (state.activeTacticsTool === "eraser") {
        state.tacticsCtx.globalCompositeOperation = "destination-out";
        state.tacticsCtx.strokeStyle = "rgba(0,0,0,1)";
        state.tacticsCtx.lineWidth = 24; // 消しゴムは 24
    } else {
        state.tacticsCtx.globalCompositeOperation = "source-over";
        state.tacticsCtx.strokeStyle = state.currentDrawingObj.color;
        state.tacticsCtx.lineWidth = 4; // ペンは 4
    }
    state.tacticsCtx.lineCap = "round";
    state.tacticsCtx.lineJoin = "round";
    
    const lastIdx = state.currentDrawingObj.points.length - 1;
    const p1 = state.currentDrawingObj.points[lastIdx - 1];
    const p2 = state.currentDrawingObj.points[lastIdx];

    state.tacticsCtx.beginPath();
    state.tacticsCtx.moveTo(p1.x * dom.tacticsCanvas.width, p1.y * dom.tacticsCanvas.height);
    state.tacticsCtx.lineTo(p2.x * dom.tacticsCanvas.width, p2.y * dom.tacticsCanvas.height);
    state.tacticsCtx.stroke();
    
    if (state.activeTacticsTool === "eraser") {
        state.tacticsCtx.globalCompositeOperation = "source-over";
    }
}

function stopTacticsDraw() {
    if (!state.isTacticsDrawing || !state.currentDrawingObj) return;
    state.isTacticsDrawing = false;

    if (state.currentDrawingObj.points.length >= 2) {
        state.tacticsDrawings.push(state.currentDrawingObj);
        saveTacticsData();
    }
    state.currentDrawingObj = null;
}

// ----------------------------------------------------------------------------
// 12. アプリ全体のイベント制御
// ----------------------------------------------------------------------------
function setupEventListeners() {
    // URL入力欄のクリック/フォーカス時に全選択するヘルパー
    function makeInputAutoSelect(input) {
        if (!input) return;
        
        let isFocused = false;
        
        input.addEventListener("focus", function() {
            setTimeout(() => {
                input.select();
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(0, input.value.length);
                }
            }, 50);
        });

        input.addEventListener("blur", () => {
            isFocused = false;
        });

        input.addEventListener("click", function(e) {
            if (!isFocused) {
                isFocused = true;
                input.select();
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(0, input.value.length);
                }
                e.preventDefault();
            }
        });
    }

    // 各URL入力欄に自動全選択を適用
    makeInputAutoSelect(dom.youtubeUrl);
    makeInputAutoSelect(dom.mobileYoutubeUrl);
    makeInputAutoSelect(dom.settingsYoutubeUrl);

    // 1. 動画の読み込みボタン (PC版)
    if (dom.loadVideoBtn) {
        dom.loadVideoBtn.addEventListener("click", () => {
            const url = dom.youtubeUrl.value.trim();
            triggerVideoLoad(url);
        });
    }

    // 1-2. 動画の読み込みボタン (スマホメイン版)
    if (dom.mobileLoadVideoBtn) {
        dom.mobileLoadVideoBtn.addEventListener("click", () => {
            const url = dom.mobileYoutubeUrl.value.trim();
            triggerVideoLoad(url);
        });
    }

    // 1-3. 動画の読み込みボタン (設定モーダル版)
    if (dom.settingsLoadVideoBtn) {
        dom.settingsLoadVideoBtn.addEventListener("click", () => {
            const url = dom.settingsYoutubeUrl.value.trim();
            triggerVideoLoad(url);
            if (dom.settingsModal) dom.settingsModal.classList.remove("active");
        });
    }

    // 2. 過去の分析動画履歴の切り替え (PC版)
    if (dom.videoHistorySelect) {
        dom.videoHistorySelect.addEventListener("change", (e) => {
            triggerVideoSelect(e.target.value);
        });
    }

    // 2-2. 過去の分析動画履歴の切り替え (スマホメイン版)
    if (dom.mobileVideoHistorySelect) {
        dom.mobileVideoHistorySelect.addEventListener("change", (e) => {
            triggerVideoSelect(e.target.value);
        });
    }

    // 2-3. 過去の分析動画履歴の切り替え (設定モーダル版)
    if (dom.settingsVideoHistorySelect) {
        dom.settingsVideoHistorySelect.addEventListener("change", (e) => {
            triggerVideoSelect(e.target.value);
            if (dom.settingsModal) dom.settingsModal.classList.remove("active");
        });
    }

    // キーボードショートカット
    window.addEventListener("keydown", (e) => {
        // テキスト入力中はショートカットを無視
        if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
            return;
        }

        if (e.code === "Space") {
            e.preventDefault();
            togglePlayPause();
        } else if (e.code === "ArrowLeft") {
            e.preventDefault();
            seekVideoDelta(-5);
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            seekVideoDelta(5);
        }
    });

    // 再生・一時停止
    if (dom.playPauseBtn) dom.playPauseBtn.addEventListener("click", togglePlayPause);
    if (dom.prevFrameBtn) dom.prevFrameBtn.addEventListener("click", () => seekVideoDelta(-5));
    if (dom.nextFrameBtn) dom.nextFrameBtn.addEventListener("click", () => seekVideoDelta(5));

    // 再生速度
    if (dom.speedSelect) {
        dom.speedSelect.addEventListener("change", (e) => {
            if (state.playerReady && state.player) {
                state.player.setPlaybackRate(parseFloat(e.target.value));
            }
        });
    }

    // シークバー操作
    if (dom.timelineSlider) {
        dom.timelineSlider.addEventListener("input", (e) => {
            if (state.playerReady && state.player) {
                const time = parseFloat(e.target.value);
                state.player.seekTo(time, true);
            }
        });
    }

    // アノテーションツール切り替え
    if (dom.toolBtns) {
        dom.toolBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener("click", () => {
                    const clickedTool = btn.getAttribute("data-tool");
                    const ytContainer = document.getElementById("yt-player-container");
                    
                    // すでに選択中のツールを再クリックした場合はトグル解除（閲覧モードに戻る）
                    if (state.activeTool === clickedTool) {
                        state.activeTool = "";
                        
                        if (state.canvas) {
                            state.canvas.classList.remove("drawing-active");
                        }
                        if (ytContainer) ytContainer.style.pointerEvents = "auto"; // 動画操作を可能に
                    } else {
                        // 新規にツールを選択
                        state.activeTool = clickedTool;
                        
                        if (state.canvas) {
                            state.canvas.classList.add("drawing-active");
                        }
                        if (ytContainer) ytContainer.style.pointerEvents = "none"; // 動画操作を透過し、描き込み可能に
                    }
                    
                    // ツール切り替えに伴うスライダー値の復元
                    if (dom.brushSize) {
                        if (state.activeTool === "eraser") {
                            dom.brushSize.value = state.eraserSize;
                            if (dom.brushSizeVal) {
                                dom.brushSizeVal.textContent = (state.eraserSize * 3) + "px";
                            }
                        } else if (state.activeTool) {
                            dom.brushSize.value = state.brushSize;
                            if (dom.brushSizeVal) {
                                dom.brushSizeVal.textContent = state.brushSize + "px";
                            }
                        }
                    }
                    
                    // カーソルの更新とUI同期
                    updateCanvasToolClass();
                    syncAnnotationToolbarUI();
                });
            }
        });
    }

    // カラーパレット (映像分析用)
    if (dom.colorDots) {
        dom.colorDots.forEach(dot => {
            if (dot) {
                dot.addEventListener("click", () => {
                    state.currentColor = dot.getAttribute("data-color");
                    syncAnnotationToolbarUI();
                });
            }
        });
    }

    // ブラシ太さ
    if (dom.brushSize) {
        dom.brushSize.addEventListener("input", (e) => {
            const val = parseInt(e.target.value);
            if (state.activeTool === "eraser") {
                state.eraserSize = val;
                if (dom.brushSizeVal) {
                    dom.brushSizeVal.textContent = (state.eraserSize * 3) + "px"; // 消しゴムサイズは3倍で表示
                }
                // マウスストーカー円のサイズも即座に更新する
                const eraserCursor = document.getElementById("eraser-cursor");
                if (eraserCursor) {
                    eraserCursor.style.width = `${state.eraserSize * 3}px`;
                    eraserCursor.style.height = `${state.eraserSize * 3}px`;
                    
                    // スライダー操作中にキャンバス中央に一時的にプレビューを表示する
                    const rect = state.canvas.getBoundingClientRect();
                    const x = rect.width / 2;
                    const y = rect.height / 2;
                    eraserCursor.style.left = `${x}px`;
                    eraserCursor.style.top = `${y}px`;
                    eraserCursor.style.display = "block";
                    
                    // 操作停止後1秒で非表示にする
                    clearTimeout(state.eraserPreviewTimeout);
                    state.eraserPreviewTimeout = setTimeout(() => {
                        eraserCursor.style.display = "none";
                    }, 1000);
                }
            } else {
                state.brushSize = val;
                if (dom.brushSizeVal) {
                    dom.brushSizeVal.textContent = state.brushSize + "px";
                }
            }
        });
    }

    // アノテーションUndo (現在のタイムスタンプのアノテーションを1件削除)
    if (dom.undoBtn) {
        dom.undoBtn.addEventListener("click", () => {
            // 現在の動画時間に近いアノテーションを見つけて最新のものを1件消す
            const timeFiltered = state.annotations
                .filter(ann => Math.abs(state.playbackTime - ann.time) <= 1.5)
                .sort((a, b) => b.id.localeCompare(a.id)); // ID（タイムスタンプ）降順
                
            if (timeFiltered.length > 0) {
                deleteData("annotations", timeFiltered[0].id);
            }
        });
    }

    // 全消去 (現在のタイムスタンプのアノテーションを全て削除)
    if (dom.clearBtn) {
        dom.clearBtn.addEventListener("click", () => {
            const timeFiltered = state.annotations.filter(ann => Math.abs(state.playbackTime - ann.time) <= 1.5);
            if (timeFiltered.length > 0) {
                if (confirm("このシーンの描き込みを全て削除しますか？")) {
                    timeFiltered.forEach(ann => {
                        deleteData("annotations", ann.id);
                    });
                }
            }
        });
    }

    // カスタムタグ追加（即時打刻ではなく、クイックタグ選択肢に追加して自動選択状態にする）
    if (dom.addTagBtn) {
        dom.addTagBtn.addEventListener("click", () => {
            if (dom.newTagName) {
                const tagName = dom.newTagName.value.trim();
                if (!tagName) return;

                // 重複していない場合のみ追加
                if (!state.quickTags.includes(tagName)) {
                    state.quickTags.push(tagName);
                }
                
                // 自動で選択状態にする
                if (!state.selectedQuickTags.includes(tagName)) {
                    state.selectedQuickTags.push(tagName);
                }

                dom.newTagName.value = "";
                renderTagsList(); // クイックタグ一覧を再描画
                showNotification(`タグ「${tagName}」を選択肢に追加し、選択状態にしました。`, "success", 2000);
            }
        });
    }

    // 選択したタグの一括打刻
    if (dom.submitTagsBtn) {
        dom.submitTagsBtn.addEventListener("click", () => {
            if (!state.selectedQuickTags || state.selectedQuickTags.length === 0) {
                showNotification("打刻するタグを1つ以上選択してください。", "warning");
                return;
            }

            const playerNum = dom.stampPlayerNumber ? dom.stampPlayerNumber.value : "";
            const time = state.playbackTime;
            const user = state.username;
            const id = "tag_" + Date.now();

            const newTag = {
                id: id,
                time: time,
                name: state.selectedQuickTags.join(", "),
                names: [...state.selectedQuickTags],
                playerNumber: playerNum,
                comment: "",
                user: user
            };

            saveData("tags", id, newTag);

            showNotification(`${state.selectedQuickTags.length}件のタグを一括打刻しました。`, "success");

            // 選択状態をリセットしてUIを再描画
            state.selectedQuickTags = [];
            renderTagsList();
        });
    }

    // 選手タグフィルター変更
    if (dom.tagFilterPlayer) {
        dom.tagFilterPlayer.addEventListener("change", (e) => {
            state.tagFilterPlayer = e.target.value;
            renderTagsList();
        });
    }

    // 背番号入力時のバリデーション (全角数字➔半角数字に変換、数字以外をカット)
    if (dom.stampPlayerNumber) {
        dom.stampPlayerNumber.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248)).replace(/[^0-9]/g, "");
        });
    }

    if (dom.newTagName) {
        dom.newTagName.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && dom.addTagBtn) {
                dom.addTagBtn.click();
            }
        });
    }

    // チャット送信
    if (dom.sendChatBtn) dom.sendChatBtn.addEventListener("click", sendChatMessage);
    if (dom.chatMessageInput) {
        dom.chatMessageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    if (dom.clearTacticsDrawings) {
        dom.clearTacticsDrawings.addEventListener("click", () => {
            if (confirm("作戦盤の手書きラインをクリアしますか？")) {
                state.tacticsDrawings = [];
                saveTacticsData();
            }
        });
    }

    if (dom.resetTacticsPieces) {
        dom.resetTacticsPieces.addEventListener("click", () => {
            if (confirm("作戦盤の駒を初期状態（すべてプールへ）に戻しますか？")) {
                state.tacticsPieces = [];
                saveTacticsData();
            }
        });
    }

    // 作戦盤ツール切り替え
    if (dom.ttoolBtns) {
        dom.ttoolBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener("click", () => {
                    dom.ttoolBtns.forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.activeTacticsTool = btn.getAttribute("data-ttool");
                    // カーソルの更新
                    updateTacticsCanvasToolClass();
                });
            }
        });
    }

    // 作戦盤カラー
    if (dom.tcolorDots) {
        dom.tcolorDots.forEach(dot => {
            if (dot) {
                dot.addEventListener("click", () => {
                    dom.tcolorDots.forEach(d => d.classList.remove("active"));
                    dot.classList.add("active");
                    state.currentTacticsColor = dot.getAttribute("data-color");
                });
            }
        });
    }

    // 設定モーダル制御
    if (dom.openSettingsBtn) dom.openSettingsBtn.addEventListener("click", () => {
        if (dom.settingsModal) dom.settingsModal.classList.add("active");
    });
    if (dom.closeSettingsBtn) dom.closeSettingsBtn.addEventListener("click", () => {
        if (dom.settingsModal) dom.settingsModal.classList.remove("active");
    });
    
    // 設定保存
    if (dom.saveSettingsBtn) {
        dom.saveSettingsBtn.addEventListener("click", () => {
            const username = (dom.settingsUsername ? dom.settingsUsername.value.trim() : "") || "ゲストユーザー";
            localStorage.setItem("splyza_username", username);
            state.username = username;

            // Firebase設定
            const config = {
                apiKey: dom.fbApiKey ? dom.fbApiKey.value.trim() : "",
                authDomain: dom.fbAuthDomain ? dom.fbAuthDomain.value.trim() : "",
                projectId: dom.fbProjectId ? dom.fbProjectId.value.trim() : "",
                appId: dom.fbAppId ? dom.fbAppId.value.trim() : ""
            };

            if (config.apiKey && config.projectId) {
                localStorage.setItem("splyza_firebase_config", JSON.stringify(config));
                state.firebaseConfig = config;
                initFirebase(config);
                if (state.isFirebaseEnabled) {
                    showNotification("Firebase同期設定を保存し、接続しました！", "success");
                } else {
                    showNotification("Firebase設定に誤りがあるか、接続できませんでした。ローカル保存モードで起動します。", "warning");
                }
            } else {
                localStorage.removeItem("splyza_firebase_config");
                state.firebaseConfig = null;
                state.isFirebaseEnabled = false;
                state.db = null;
                showNotification("設定を保存しました（ローカル保存モード）。", "info");
            }

            updateUIForFirebaseStatus();
            if (dom.settingsModal) dom.settingsModal.classList.remove("active");
            
            // データを再読み込み
            loadAllData();
        });
    }

    // 設定リセット
    if (dom.clearSettingsBtn) {
        dom.clearSettingsBtn.addEventListener("click", () => {
            if (confirm("設定を完全に初期化しますか？")) {
                localStorage.removeItem("splyza_username");
                localStorage.removeItem("splyza_firebase_config");
                location.reload();
            }
        });
    }

    // テーマ切り替え
    if (dom.themeToggleBtn) {
        dom.themeToggleBtn.addEventListener("click", () => {
            const isLight = document.body.classList.toggle("light-theme");
            localStorage.setItem("splyza_theme", isLight ? "light" : "dark");
            updateThemeToggleIcon(isLight);
        });
    }

    // 全画面表示
    if (dom.fullscreenBtn) {
        dom.fullscreenBtn.addEventListener("click", toggleFullscreen);
    }

    // フルスクリーン変更イベントの監視
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // 画面回転時に擬似フルスクリーンのCanvasサイズを補正
    function handleOrientationOrResize() {
        if (dom.playerWrapper && dom.playerWrapper.classList.contains("pseudo-fullscreen")) {
            // 画面回転後にビューポートサイズが確定するまで少し待つ
            setTimeout(() => {
                resizeCanvas();
            }, 100);
            setTimeout(() => {
                resizeCanvas();
            }, 300);
            setTimeout(() => {
                resizeCanvas();
            }, 600);
        }
    }
    window.addEventListener("orientationchange", handleOrientationOrResize);
    window.addEventListener("resize", handleOrientationOrResize);

    // 動画右下全画面ボタン
    if (dom.videoFullscreenBtnOverlay) {
        dom.videoFullscreenBtnOverlay.addEventListener("click", toggleFullscreen);
    }

    // フルスクリーンアノテーションツールバーのツール切り替え
    if (dom.fsToolBtns) {
        dom.fsToolBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener("click", () => {
                    const clickedTool = btn.getAttribute("data-tool");
                    const ytContainer = document.getElementById("yt-player-container");
                    
                    if (state.activeTool === clickedTool) {
                        state.activeTool = "";
                        if (state.canvas) {
                            state.canvas.classList.remove("drawing-active");
                        }
                        if (ytContainer) ytContainer.style.pointerEvents = "auto";
                    } else {
                        state.activeTool = clickedTool;
                        if (state.canvas) {
                            state.canvas.classList.add("drawing-active");
                        }
                        if (ytContainer) ytContainer.style.pointerEvents = "none";
                    }
                    
                    // ツール切り替えに伴うスライダー値の同期
                    if (dom.brushSize) {
                        if (state.activeTool === "eraser") {
                            dom.brushSize.value = state.eraserSize;
                            if (dom.brushSizeVal) {
                                dom.brushSizeVal.textContent = (state.eraserSize * 3) + "px";
                            }
                        } else if (state.activeTool) {
                            dom.brushSize.value = state.brushSize;
                            if (dom.brushSizeVal) {
                                dom.brushSizeVal.textContent = state.brushSize + "px";
                            }
                        }
                    }
                    
                    updateCanvasToolClass();
                    syncAnnotationToolbarUI();
                });
            }
        });
    }

    // フルスクリーンアノテーションツールバーのカラー切り替え
    if (dom.fsColorDots) {
        dom.fsColorDots.forEach(dot => {
            if (dot) {
                dot.addEventListener("click", () => {
                    state.currentColor = dot.getAttribute("data-color");
                    syncAnnotationToolbarUI();
                });
            }
        });
    }

    // フルスクリーン Undo
    if (dom.fsUndoBtn) {
        dom.fsUndoBtn.addEventListener("click", () => {
            if (dom.undoBtn) dom.undoBtn.click();
        });
    }

    // フルスクリーン Clear
    if (dom.fsClearBtn) {
        dom.fsClearBtn.addEventListener("click", () => {
            if (dom.clearBtn) dom.clearBtn.click();
        });
    }

    // フルスクリーン解除
    if (dom.fsCloseBtn) {
        dom.fsCloseBtn.addEventListener("click", toggleFullscreen);
    }

    // フルスクリーンツールバーの展開トリガー
    if (dom.fsTriggerBtn) {
        dom.fsTriggerBtn.addEventListener("click", () => {
            if (dom.fullscreenToolbar) dom.fullscreenToolbar.classList.add("active");
            dom.fsTriggerBtn.classList.add("hidden-trigger");
        });
    }

    // フルスクリーンツールバーの最小化（たたむ）
    if (dom.fsMinimizeBtn) {
        dom.fsMinimizeBtn.addEventListener("click", () => {
            if (dom.fullscreenToolbar) dom.fullscreenToolbar.classList.remove("active");
            if (dom.fsTriggerBtn) dom.fsTriggerBtn.classList.remove("hidden-trigger");
        });
    }
}

function syncAnnotationToolbarUI() {
    // ツールボタンの同期
    if (dom.toolBtns) {
        dom.toolBtns.forEach(btn => {
            const tool = btn.getAttribute("data-tool");
            if (tool === state.activeTool) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }
    if (dom.fsToolBtns) {
        dom.fsToolBtns.forEach(btn => {
            const tool = btn.getAttribute("data-tool");
            if (tool === state.activeTool) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    // カラーの同期
    if (dom.colorDots) {
        dom.colorDots.forEach(dot => {
            const color = dot.getAttribute("data-color");
            if (color === state.currentColor) {
                dot.classList.add("active");
            } else {
                dot.classList.remove("active");
            }
        });
    }
    if (dom.fsColorDots) {
        dom.fsColorDots.forEach(dot => {
            const color = dot.getAttribute("data-color");
            if (color === state.currentColor) {
                dot.classList.add("active");
            } else {
                dot.classList.remove("active");
            }
        });
    }
}

function toggleFullscreen() {
    const wrapper = dom.playerWrapper;
    if (!wrapper) return;

    const hasNativeFullscreen = !!(wrapper.requestFullscreen || wrapper.webkitRequestFullscreen);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // iOSやネイティブフルスクリーンが使えないデバイス、またはすでに擬似フルスクリーンが有効な場合は擬似フルスクリーンを使用
    if (!hasNativeFullscreen || isIOS || wrapper.classList.contains("pseudo-fullscreen")) {
        const isPseudo = wrapper.classList.toggle("pseudo-fullscreen");
        handleFullscreenChangeManual(isPseudo);
        return;
    }

    // ネイティブフルスクリーンを試みる
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (wrapper.requestFullscreen) {
                wrapper.requestFullscreen().catch(() => {
                    // 拒否された場合は擬似フルスクリーンにフォールバック
                    wrapper.classList.add("pseudo-fullscreen");
                    handleFullscreenChangeManual(true);
                });
            } else if (wrapper.webkitRequestFullscreen) {
                wrapper.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    } catch (e) {
        console.warn("Native fullscreen failed, falling back to pseudo-fullscreen", e);
        const isPseudo = wrapper.classList.toggle("pseudo-fullscreen");
        handleFullscreenChangeManual(isPseudo);
    }
}

function handleFullscreenChangeManual(isFullscreen) {
    if (dom.fullscreenBtn) {
        const icon = dom.fullscreenBtn.querySelector("i");
        if (icon) {
            if (isFullscreen) {
                icon.className = "fa-solid fa-compress";
                dom.fullscreenBtn.title = "全画面表示を解除";
            } else {
                icon.className = "fa-solid fa-expand";
                dom.fullscreenBtn.title = "全画面表示";
            }
        }
    }
    
    // 全画面ボタン（動画上のオーバーレイボタン）のアイコンも同期
    if (dom.videoFullscreenBtnOverlay) {
        const icon = dom.videoFullscreenBtnOverlay.querySelector("i");
        if (icon) {
            icon.className = isFullscreen ? "fa-solid fa-compress" : "fa-solid fa-expand";
        }
    }

    // 全画面解除されたら、ツールバーを畳んだ状態（初期状態）に強制リセット
    if (!isFullscreen) {
        if (dom.fullscreenToolbar) dom.fullscreenToolbar.classList.remove("active");
        if (dom.fsTriggerBtn) dom.fsTriggerBtn.classList.remove("hidden-trigger");
    }

    // 画面切り替え時のCanvasサイズ補正
    setTimeout(() => {
        resizeCanvas();
    }, 150);
}

function handleFullscreenChange() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    // 擬似フルスクリーンクラスが付いている場合はネイティブ側のイベントを無視して擬似側に任せる
    if (dom.playerWrapper && dom.playerWrapper.classList.contains("pseudo-fullscreen") && !isFullscreen) {
        return;
    }
    handleFullscreenChangeManual(isFullscreen);
}

function togglePlayPause() {
    if (!state.playerReady || !state.player) return;
    
    const playerState = state.player.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
        state.player.pauseVideo();
    } else {
        state.player.playVideo();
    }
}

function seekVideoDelta(seconds) {
    if (!state.playerReady || !state.player) return;
    const curr = state.player.getCurrentTime();
    state.player.seekTo(Math.max(0, Math.min(state.duration, curr + seconds)), true);
}
