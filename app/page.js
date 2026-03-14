// app/page.jsx
'use client';

import { useEffect, useRef } from 'react';

export default function ClockTerminal() {
    const canvasRef = useRef(null);
    const audioDataRef = useRef({ bass: 0, frequencies: [] }); // 嚴禁使用 state 存放高頻資料
    const reqAnimRef = useRef(null);
    // 在元件頂部 useEffect 之外宣告這兩個 useRef，用來記憶跨幀狀態
    const smoothedFreqsRef = useRef(new Array(64).fill(0));
    const rotationRef = useRef(0); // [OPTIONAL: Code Session] 用於控制光環自轉的角度

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: true }); // 優化：明確指定 alpha

        // 【修改點 1】：已經刪除原本寫死的 size 與 ctx.scale，將控制權完全交給下方的 draw 迴圈

        // 連接 WebSocket 取回音訊資料
        const ws = new WebSocket('ws://localhost:8080');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // 直接更新 ref，不觸發 re-render
                audioDataRef.current = data;
            } catch (err) {
                console.error('Data parsing error:', err);
            }
        };

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // 【修改點 2】：取得設備的像素比例 (High-DPI / Retina 通常大於 1)
            const dpr = window.devicePixelRatio || 1;

            // 取得當下視窗的邏輯尺寸
            const w = window.innerWidth;
            const h = window.innerHeight;

            // 調整實際畫布的「物理像素」大小，並用 CSS 鎖定「邏輯顯示」大小
            if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
                canvas.width = Math.floor(w * dpr);
                canvas.height = Math.floor(h * dpr);
                canvas.style.width = `${w}px`;
                canvas.style.height = `${h}px`;
            }

            const clockSize = h * 0.35; // 調整這個小數點就能一次縮放整個時鐘

            const { bass = 0, frequencies = [] } = audioDataRef.current;
            const ctx = canvas.getContext('2d');

            // 清除整個「物理」畫布
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // --- 1. [Performance Optimization] 數值平滑化 (Lerp) ---
            // 吸收音訊瞬間歸零的抖動，讓光環的擴張與收縮充滿彈性
            const lerpFactor = 0.15; // 平滑係數 (0~1)，越小越平滑但反應越慢
            if (frequencies.length > 0) {
                for (let i = 0; i < 64; i++) {
                    const target = frequencies[i] || 0;
                    // 當前數值 = 當前數值 + (目標數值 - 當前數值) * 平滑係數
                    smoothedFreqsRef.current[i] += (target - smoothedFreqsRef.current[i]) * lerpFactor;
                }
            }

            // --- 進入繪圖環境 ---
            ctx.save();

            // 【修改點 3】：根據設備比例縮放 Context。
            // 這樣後續的時鐘與頻譜計算，都可以安心把螢幕當作邏輯尺寸 (w, h) 來算，不用改任何數字！
            ctx.scale(dpr, dpr);

            ctx.translate(w / 2, h / 2); // 原點置中

            // --- 2. 繪製優美頻譜光環 ---
            ctx.save();

            // 緩慢旋轉：讓特定頻率的突起不會永遠卡在同一個位置
            rotationRef.current += 0.0015;
            ctx.rotate(rotationRef.current);

            ctx.beginPath();
            const pointsCount = 128; // 總共 128 個點，左右各 64 點形成完美鏡像
            const angleStep = (Math.PI * 2) / pointsCount;
            const baseRadius = clockSize * 0.6; // 頻譜半徑為基準大小的 60%

            for (let i = 0; i < pointsCount; i++) {
                // [Logic Explanation] 陣列鏡像：
                // i 從 0~63 時，讀取 0~63 的頻率；i 從 64~127 時，反向讀取 63~0 的頻率。
                // 這樣保證了圓環的起點 (0度) 與終點 (360度) 數值絕對一致，形成毫無破綻的封閉曲線。
                const dataIndex = i < 64 ? i : 127 - i;
                const value = smoothedFreqsRef.current[dataIndex];

                // 將 0~255 的平滑數值映射為向外的擴張高度 (最大凸起 60px)
                const bump = (value / 255) * 60;
                const r = baseRadius + bump;

                const angle = i * angleStep;
                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            ctx.closePath(); // 完美接合起點與終點

            // 科技感配色與重低音發光特效
            // [動態色彩映射]：將 Bass (0~255) 轉換為 HSL 色相偏移
            // HSL 色相環：120(綠) -> 180(青藍) -> 240(深藍) -> 280(紫)

            // 將基礎色設為 140 (偏綠的薄荷色)
            // 當 bass 達到最大的 255 時，色相會加上 100，達到 240 (純藍色)
            // 這樣就能在音樂起伏時，平滑地橫跨整個藍綠色系
            const dynamicHue = 60 - (bass / 255) * 60;

            // 亮度微調：藍色的視覺明度較低，重低音時稍微提亮 15% 確保光暈依然清晰
            const dynamicLightness = 50 + (bass / 255) * 15;

            const themeColor = `hsl(${dynamicHue}, 80%, ${dynamicLightness}%)`;

            // 將 0~255 的 bass 數值線性映射到 10~35 的發光強度，創造柔和的呼吸感
            const dynamicGlow = 10 + (bass / 255) * 25;

            ctx.strokeStyle = themeColor; // 採用動態運算的色彩
            ctx.shadowBlur = dynamicGlow;
            ctx.shadowColor = themeColor; // 陰影也採用動態運算的色彩
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round'; // 讓線段相連處呈現圓潤的弧度，避免尖銳折角
            ctx.stroke();

            ctx.restore(); // 結束頻譜光環的渲染環境，避免旋轉與陰影影響到時鐘指針

            // --- 3. 繪製時鐘指針 ---
            ctx.save();
            ctx.rotate(-Math.PI / 2); // 時鐘專屬的起始角度 (12點鐘方向)

            const now = new Date();
            const sec = now.getSeconds() + now.getMilliseconds() / 1000;
            const min = now.getMinutes() + sec / 60;
            const hr = (now.getHours() % 12) + min / 60;

            const secAngle = (sec / 60) * (Math.PI * 2);
            const minAngle = (min / 60) * (Math.PI * 2);
            const hrAngle = (hr / 12) * (Math.PI * 2);

            const drawHand = (angle, length, color, weight) => {
                ctx.save();
                ctx.rotate(angle);
                ctx.strokeStyle = color;
                ctx.lineWidth = weight;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(length, 0);
                ctx.stroke();
                ctx.restore();
            };

            drawHand(secAngle, clockSize * 0.8, '#D3D3D3', 2); // 秒針長度為基準大小的 80%
            drawHand(minAngle, clockSize * 0.65, '#808080', 4); // 分針長度為基準大小的 65%
            drawHand(hrAngle, clockSize * 0.4, '#778899', 6); // 時針長度為基準大小的 40%

            // 畫中心點
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore(); // 結束時鐘渲染

            ctx.restore(); // 結束 DPR 縮放與置中偏移
            reqAnimRef.current = requestAnimationFrame(draw);
        };

        // 啟動繪製迴圈
        draw();

        return () => {
            cancelAnimationFrame(reqAnimRef.current);
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, []);

    return (
        <main
            className="w-screen h-screen overflow-hidden flex items-center justify-center bg-black/20"
            style={{ WebkitAppRegion: 'drag' }}
        >
            <canvas ref={canvasRef} className="block" />
        </main>
    );
}
