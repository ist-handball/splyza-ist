// ============================================================================
// SPLYZA Teams Clone - Core Application Logic
// ============================================================================

// ----------------------------------------------------------------------------
// 1. グローバル状態管理
// ----------------------------------------------------------------------------
const state = {
    // ユーザー情報
    username: "ゲストユーザー",
    
    // 現在のYouTube動画ID
    videoId: "dQw4w9WgXcQ", // デフォルト (YouTube APIの初期ロード確認用)
    
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
    courtType: "soccer",
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
    activeTool: "pen", // 'pen' | 'arrow' | 'rect' | 'circle' | 'text'
    currentColor: "#ff4757",
    brushSize: 4,
    startX: 0,
    startY: 0,
    currentDrawingObj: null, // 現在描画中のオブジェクト

    // 作戦盤Canvas関連
    tacticsCanvas: null,
    tacticsCtx: null,
    isTacticsDrawing: false,
    activeTacticsTool: "pen", // 'pen' | 'eraser'
    currentTacticsColor: "#ffffff",
    tacticsHistory: []
};

// ----------------------------------------------------------------------------
// 2. 初期化とイベントリスナー設定
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initDOMReferences();
    loadSettingsFromStorage();
    initAppTabs();
    initCanvas();
    initTacticsCanvas();
    initDragAndDrop();
    setupEventListeners();
    updateUIForFirebaseStatus();
    
    // 初期データの読み込み
    loadAllData();

    // YouTube APIが既にロード済みの場合のフォールバック (app.jsより先にAPIスクリプトが読み込まれていた場合)
    if (typeof YT !== "undefined" && YT.Player && !state.player) {
        loadYouTubeVideo(state.videoId);
    }
});

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
        courtTypeSelect: document.getElementById("court-type-select"),
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
        userDisplayName: document.getElementById("user-display-name")
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
        } catch (e) {
            console.error("Firebase保存エラー。ローカルに書き込みます", e);
            saveDataLocally(videoCollection, docId, payload);
        }
    } else {
        saveDataLocally(videoCollection, docId, payload);
    }
}

// データ削除
async function deleteData(collectionName, docId) {
    const videoCollection = `video_${state.videoId}_${collectionName}`;
    
    if (state.isFirebaseEnabled && state.db) {
        try {
            await state.db.collection(videoCollection).doc(docId).delete();
        } catch (e) {
            console.error("Firebase削除エラー。ローカルから削除します", e);
            deleteDataLocally(videoCollection, docId);
        }
    } else {
        deleteDataLocally(videoCollection, docId);
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
            state.tacticsPieces = boardDoc.pieces || [];
            state.tacticsDrawings = boardDoc.drawings || [];
            renderTacticsBoard();
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
    loadYouTubeVideo(state.videoId);
};

function loadYouTubeVideo(videoId) {
    // すでにプレイヤーが存在し、cueVideoByIdが使える場合は動画IDのみを切り替える
    if (state.player && state.playerReady && typeof state.player.cueVideoById === "function") {
        try {
            state.player.cueVideoById(videoId);
            // cueVideoById後、durationの更新を待つ
            setTimeout(() => {
                retryGetDuration();
            }, 500);
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
    let ytPlayerEl = document.getElementById("yt-player");
    if (!ytPlayerEl) {
        const container = document.getElementById("yt-player-container");
        if (container) {
            container.innerHTML = '<div id="yt-player"></div>';
        }
    }
    
    state.player = new YT.Player("yt-player", {
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
    } else if (retries > 0) {
        setTimeout(() => retryGetDuration(retries - 1), 500);
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        dom.playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        // 再生中はアノテーション入力を不可（透過）にする
        state.canvas.classList.remove("drawing-active");
    } else {
        dom.playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        // 一時停止中はアノテーションツールがアクティブなら入力を有効にする
        if (state.activeTool) {
            state.canvas.classList.add("drawing-active");
        }
    }
    // 再生状態の変化に伴ってCanvasを再描画
    renderAnnotationsOnCanvas();
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
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}

// ----------------------------------------------------------------------------
// 7. アノテーション描き込み機能 (Canvas)
// ----------------------------------------------------------------------------
function initCanvas() {
    // マウス・タッチイベントの登録 (映像分析用)
    state.canvas.addEventListener("mousedown", startDrawing);
    state.canvas.addEventListener("mousemove", draw);
    state.canvas.addEventListener("mouseup", stopDrawing);
    state.canvas.addEventListener("mouseleave", stopDrawing);
}

function resizeCanvas() {
    // YouTube埋め込みの表示サイズにキャンバスサイズを正確にフィットさせる
    const container = document.querySelector(".player-wrapper");
    if (!container) return;

    const rect = container.getBoundingClientRect();
    state.canvas.width = rect.width;
    state.canvas.height = rect.height;
    
    // 再描画
    renderAnnotationsOnCanvas();
}

// 描画開始
function startDrawing(e) {
    if (state.player && state.player.getPlayerState() === YT.PlayerState.PLAYING) {
        // 動画再生中は描画させず、一時停止する
        state.player.pauseVideo();
        return;
    }

    state.isDrawing = true;
    const rect = state.canvas.getBoundingClientRect();
    state.startX = e.clientX - rect.left;
    state.startY = e.clientY - rect.top;

    state.currentDrawingObj = {
        tool: state.activeTool,
        color: state.currentColor,
        size: state.brushSize,
        points: [{ x: state.startX, y: state.startY }]
    };
}

// 描画中
function draw(e) {
    if (!state.isDrawing || !state.currentDrawingObj) return;

    const rect = state.canvas.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

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

    const rect = state.canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

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
        if (state.activeTool === "pen" && pathLength < 2) {
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
        size: state.currentDrawingObj.size,
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
        state.ctx.strokeStyle = ann.color;
        state.ctx.fillStyle = ann.color;
        state.ctx.lineWidth = ann.size;
        state.ctx.lineCap = "round";
        state.ctx.lineJoin = "round";

        // 比率から実際ピクセル座標に変換
        const pxPoints = ann.points.map(p => ({
            x: p.x * state.canvas.width,
            y: p.y * state.canvas.height
        }));

        if (ann.tool === "pen") {
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
const defaultQuickTags = ["得点", "失点", "シュート", "パス成功", "ミス", "ファウル", "タイムアウト", "チャンス"];

function renderTagsList() {
    // クイック打刻タグボタン
    dom.quickTagsContainer.innerHTML = "";
    defaultQuickTags.forEach(tagName => {
        const btn = document.createElement("button");
        btn.className = "tag-btn-item";
        btn.textContent = tagName;
        btn.addEventListener("click", () => triggerTagStamp(tagName));
        dom.quickTagsContainer.appendChild(btn);
    });

    // 打刻履歴
    dom.tagHistoryList.innerHTML = "";
    if (state.tags.length === 0) {
        dom.tagHistoryList.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:12px;">タグが打刻されていません。</div>`;
        return;
    }

    state.tags.forEach(tag => {
        const card = document.createElement("div");
        card.className = "tag-record-card";
        card.innerHTML = `
            <div class="tag-record-header">
                <span class="tag-record-title">${tag.name}</span>
                <span class="tag-record-time" data-time="${tag.time}">
                    <i class="fa-solid fa-play"></i> ${formatTime(tag.time)}
                </span>
            </div>
            <div class="tag-record-body">
                <input type="text" class="tag-record-comment" value="${tag.comment || ""}" placeholder="メモ・分析コメントを入力...">
                <span style="font-size: 10px; color:var(--text-muted)">by ${tag.user || "ゲスト"}</span>
                <button class="tag-delete-btn" title="タグ削除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;

        // イベント設定
        card.querySelector(".tag-record-time").addEventListener("click", () => {
            seekVideoTo(tag.time);
        });

        const commentInput = card.querySelector(".tag-record-comment");
        commentInput.addEventListener("change", (e) => {
            saveData("tags", tag.id, {
                ...tag,
                comment: e.target.value
            });
        });

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
    
    const id = "tag_" + Date.now();
    const newTag = {
        id: id,
        time: state.playbackTime,
        name: tagName,
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

        bubble.innerHTML = `
            <div class="chat-msg-meta">
                <strong>${msg.user}</strong>
                ${timeBadgeHtml}
            </div>
            <div class="chat-msg-content">${escapeHTML(msg.content)}</div>
        `;

        if (msg.attachTime !== undefined && msg.attachTime !== null) {
            bubble.querySelector(".chat-msg-time-badge").addEventListener("click", () => {
                seekVideoTo(msg.attachTime);
            });
        }

        dom.chatMessages.appendChild(bubble);
    });

    // スクロールを最下部に
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
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
    let svgContent = "";
    
    if (state.courtType === "soccer") {
        svgContent = `
            <svg viewBox="0 0 100 64" width="100%" height="100%">
                <!-- フィールド -->
                <rect width="100" height="64" fill="#1b4d3e" rx="2" />
                <rect x="2" y="2" width="96" height="60" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <!-- センターライン -->
                <line x1="50" y1="2" x2="50" y2="62" stroke="#ffffff" stroke-width="0.8" />
                <circle cx="50" cy="32" r="9.15" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <circle cx="50" cy="32" r="0.8" fill="#ffffff" />
                <!-- 左ペナルティエリア -->
                <rect x="2" y="14" width="16.5" height="36" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <rect x="2" y="23" width="5.5" height="18" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <circle cx="13" cy="32" r="0.8" fill="#ffffff" />
                <path d="M 18.5 26.5 A 9.15 9.15 0 0 1 18.5 37.5" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <!-- 右ペナルティエリア -->
                <rect x="81.5" y="14" width="16.5" height="36" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <rect x="92.5" y="23" width="5.5" height="18" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <circle cx="87" cy="32" r="0.8" fill="#ffffff" />
                <path d="M 81.5 26.5 A 9.15 9.15 0 0 0 81.5 37.5" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <!-- コーナーアーク -->
                <path d="M 3 2 A 1 1 0 0 1 2 3" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <path d="M 97 2 A 1 1 0 0 0 98 3" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <path d="M 2 61 A 1 1 0 0 0 3 62" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <path d="M 98 61 A 1 1 0 0 1 97 62" fill="none" stroke="#ffffff" stroke-width="0.8" />
            </svg>
        `;
    } else if (state.courtType === "basketball") {
        svgContent = `
            <svg viewBox="0 0 100 56" width="100%" height="100%">
                <!-- コート -->
                <rect width="100" height="56" fill="#2c221e" rx="2" />
                <rect x="2" y="2" width="96" height="52" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <!-- センターサークル -->
                <line x1="50" y1="2" x2="50" y2="54" stroke="#e0e0e0" stroke-width="0.8" />
                <circle cx="50" cy="28" r="7" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <!-- 左ゴール・3ポイントライン -->
                <path d="M 2 12.5 C 18 12.5, 18 43.5, 2 43.5" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <rect x="2" y="20.5" width="11.5" height="15" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <circle cx="13.5" cy="28" r="3" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <!-- 右ゴール・3ポイントライン -->
                <path d="M 98 12.5 C 82 12.5, 82 43.5, 98 43.5" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <rect x="86.5" y="20.5" width="11.5" height="15" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
                <circle cx="86.5" cy="28" r="3" fill="none" stroke="#e0e0e0" stroke-width="0.8" />
            </svg>
        `;
    } else if (state.courtType === "volleyball") {
        svgContent = `
            <svg viewBox="0 0 100 56" width="100%" height="100%">
                <!-- コート -->
                <rect width="100" height="56" fill="#1b2a47" rx="2" />
                <rect x="10" y="5" width="80" height="46" fill="none" stroke="#ffffff" stroke-width="0.8" />
                <!-- センターライン (ネット) -->
                <line x1="50" y1="5" x2="50" y2="51" stroke="#ffcc00" stroke-width="1.2" />
                <!-- アタックライン -->
                <line x1="36.6" y1="5" x2="36.6" y2="51" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="2,2" />
                <line x1="63.3" y1="5" x2="63.3" y2="51" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="2,2" />
            </svg>
        `;
    }
    
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

    // プールからのドラッグ開始
    poolContainer.addEventListener("dragstart", (e) => {
        if (e.target.classList.contains("draggable-piece")) {
            e.dataTransfer.setData("text/plain", JSON.stringify({
                source: "pool",
                team: e.target.dataset.team,
                number: e.target.dataset.number || ""
            }));
            e.dataTransfer.effectAllowed = "copy";
        }
    });

    // ドロップゾーンへのドラッグ進入時
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    });

    // ドロップ処理
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
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
    });
}

// 作戦盤データの保存
function saveTacticsData() {
    const payload = {
        pieces: state.tacticsPieces,
        drawings: state.tacticsDrawings
    };
    saveData("tactics", "board", payload);
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
        el.draggable = true;
        
        if (piece.team === "ball") {
            el.innerHTML = `<i class="fa-solid fa-volleyball"></i>`;
        } else {
            el.textContent = piece.number;
        }

        // ドラッグ開始（既存駒の移動用）
        el.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", JSON.stringify({
                source: "court",
                id: piece.id
            }));
            e.dataTransfer.effectAllowed = "move";
            // ドラッグ開始直後に透明度を下げる
            setTimeout(() => el.style.opacity = "0.5", 0);
        });

        el.addEventListener("dragend", () => {
            el.style.opacity = "1";
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
        state.tacticsCtx.strokeStyle = drawing.color;
        state.tacticsCtx.lineWidth = 4;
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
    });
}

// 作戦盤での手書き機能
function initTacticsCanvas() {
    dom.tacticsCanvas.addEventListener("mousedown", startTacticsDraw);
    dom.tacticsCanvas.addEventListener("mousemove", drawTacticsLine);
    dom.tacticsCanvas.addEventListener("mouseup", stopTacticsDraw);
    dom.tacticsCanvas.addEventListener("mouseleave", stopTacticsDraw);
}

function startTacticsDraw(e) {
    state.isTacticsDrawing = true;
    const rect = dom.tacticsCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    state.currentDrawingObj = {
        color: state.activeTacticsTool === "eraser" ? "#0d1e18" : state.currentTacticsColor, // 背景色（緑）で擬似消しゴム
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
    state.tacticsCtx.strokeStyle = state.currentDrawingObj.color;
    state.tacticsCtx.lineWidth = 4;
    state.tacticsCtx.lineCap = "round";
    state.tacticsCtx.lineJoin = "round";
    
    const lastIdx = state.currentDrawingObj.points.length - 1;
    const p1 = state.currentDrawingObj.points[lastIdx - 1];
    const p2 = state.currentDrawingObj.points[lastIdx];

    state.tacticsCtx.beginPath();
    state.tacticsCtx.moveTo(p1.x * dom.tacticsCanvas.width, p1.y * dom.tacticsCanvas.height);
    state.tacticsCtx.lineTo(p2.x * dom.tacticsCanvas.width, p2.y * dom.tacticsCanvas.height);
    state.tacticsCtx.stroke();
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
    // 1. 動画の読み込みボタン
    dom.loadVideoBtn.addEventListener("click", () => {
        const url = dom.youtubeUrl.value.trim();
        if (!url) return;
        const videoId = extractVideoId(url);
        state.videoId = videoId;
        loadYouTubeVideo(videoId);
        loadAllData();
    });

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
            seekVideoDelta(-1);
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            seekVideoDelta(1);
        }
    });

    // 再生・一時停止
    dom.playPauseBtn.addEventListener("click", togglePlayPause);
    dom.prevFrameBtn.addEventListener("click", () => seekVideoDelta(-1));
    dom.nextFrameBtn.addEventListener("click", () => seekVideoDelta(1));

    // 再生速度
    dom.speedSelect.addEventListener("change", (e) => {
        if (state.playerReady && state.player) {
            state.player.setPlaybackRate(parseFloat(e.target.value));
        }
    });

    // シークバー操作
    dom.timelineSlider.addEventListener("input", (e) => {
        if (state.playerReady && state.player) {
            const time = parseFloat(e.target.value);
            state.player.seekTo(time, true);
        }
    });

    // アノテーションツール切り替え
    dom.toolBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            dom.toolBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeTool = btn.getAttribute("data-tool");
            
            // ペンなどの選択状況に応じてCanvasのポインターイベント制御
            if (state.activeTool) {
                state.canvas.classList.add("drawing-active");
            }
        });
    });

    // カラーパレット (映像分析用)
    dom.colorDots.forEach(dot => {
        dot.addEventListener("click", () => {
            dom.colorDots.forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
            state.currentColor = dot.getAttribute("data-color");
        });
    });

    // ブラシ太さ
    dom.brushSize.addEventListener("input", (e) => {
        state.brushSize = parseInt(e.target.value);
        dom.brushSizeVal.textContent = state.brushSize + "px";
    });

    // アノテーションUndo (現在のタイムスタンプのアノテーションを1件削除)
    dom.undoBtn.addEventListener("click", () => {
        // 現在の動画時間に近いアノテーションを見つけて最新のものを1件消す
        const timeFiltered = state.annotations
            .filter(ann => Math.abs(state.playbackTime - ann.time) <= 1.5)
            .sort((a, b) => b.id.localeCompare(a.id)); // ID（タイムスタンプ）降順
            
        if (timeFiltered.length > 0) {
            deleteData("annotations", timeFiltered[0].id);
        }
    });

    // 全消去 (現在のタイムスタンプのアノテーションを全て削除)
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

    // カスタムタグ追加
    dom.addTagBtn.addEventListener("click", () => {
        const tagName = dom.newTagName.value.trim();
        if (!tagName) return;
        triggerTagStamp(tagName);
        dom.newTagName.value = "";
    });

    dom.newTagName.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            dom.addTagBtn.click();
        }
    });

    // チャット送信
    dom.sendChatBtn.addEventListener("click", sendChatMessage);
    dom.chatMessageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // 作戦盤設定
    dom.courtTypeSelect.addEventListener("change", (e) => {
        state.courtType = e.target.value;
        renderTacticsCourtSVG();
        saveTacticsData();
    });

    dom.clearTacticsDrawings.addEventListener("click", () => {
        if (confirm("作戦盤の手書きラインをクリアしますか？")) {
            state.tacticsDrawings = [];
            saveTacticsData();
        }
    });

    dom.resetTacticsPieces.addEventListener("click", () => {
        if (confirm("作戦盤の駒を初期状態（すべてプールへ）に戻しますか？")) {
            state.tacticsPieces = [];
            saveTacticsData();
        }
    });

    // 作戦盤ツール切り替え
    dom.ttoolBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            dom.ttoolBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeTacticsTool = btn.getAttribute("data-ttool");
        });
    });

    // 作戦盤カラー
    dom.tcolorDots.forEach(dot => {
        dot.addEventListener("click", () => {
            dom.tcolorDots.forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
            state.currentTacticsColor = dot.getAttribute("data-color");
        });
    });

    // 設定モーダル制御
    dom.openSettingsBtn.addEventListener("click", () => dom.settingsModal.classList.add("active"));
    dom.closeSettingsBtn.addEventListener("click", () => dom.settingsModal.classList.remove("active"));
    
    // 設定保存
    dom.saveSettingsBtn.addEventListener("click", () => {
        const username = dom.settingsUsername.value.trim() || "ゲストユーザー";
        localStorage.setItem("splyza_username", username);
        state.username = username;

        // Firebase設定
        const config = {
            apiKey: dom.fbApiKey.value.trim(),
            authDomain: dom.fbAuthDomain.value.trim(),
            projectId: dom.fbProjectId.value.trim(),
            appId: dom.fbAppId.value.trim()
        };

        if (config.apiKey && config.projectId) {
            localStorage.setItem("splyza_firebase_config", JSON.stringify(config));
            state.firebaseConfig = config;
            initFirebase(config);
        } else {
            localStorage.removeItem("splyza_firebase_config");
            state.firebaseConfig = null;
            state.isFirebaseEnabled = false;
            state.db = null;
        }

        updateUIForFirebaseStatus();
        dom.settingsModal.classList.remove("active");
        
        // データを再読み込み
        loadAllData();
    });

    // 設定リセット
    dom.clearSettingsBtn.addEventListener("click", () => {
        if (confirm("設定を完全に初期化しますか？")) {
            localStorage.removeItem("splyza_username");
            localStorage.removeItem("splyza_firebase_config");
            location.reload();
        }
    });
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
