#!/usr/bin/env bash
# 테스트용 샘플 사진/음악 생성 (다양한 비율: 4:3, 3:2, 세로, 16:9, 정사각, 3:4)
set -e
cd "$(dirname "$0")" && mkdir -p fixtures && cd fixtures
F="ffmpeg -loglevel error -y"
$F -f lavfi -i "mandelbrot=s=4000x3000:end_pts=1" -frames:v 1 -q:v 3 p01_4x3.jpg
$F -f lavfi -i "gradients=s=6000x4000:c0=0x3a6ea5:c1=0xf2c14e:c2=0xe76f51:x0=0:y0=0:x1=6000:y1=4000:n=3,format=rgb24" -frames:v 1 -q:v 3 p02_3x2.jpg
$F -f lavfi -i "cellauto=s=1080x1920:rule=110,eq=saturation=0" -frames:v 1 -q:v 3 p03_portrait.jpg
$F -f lavfi -i "life=s=1920x1080:mold=10:r=1:ratio=0.1,gblur=sigma=3" -frames:v 1 -q:v 3 p04_16x9.jpg
$F -f lavfi -i "testsrc2=s=2400x2400" -frames:v 1 -q:v 3 p05_square.jpg
$F -f lavfi -i "mandelbrot=s=3000x4000:start_scale=0.5:end_pts=1:inner=period" -frames:v 1 -q:v 3 p06_3x4.jpg
$F -f lavfi -i "sine=frequency=261.6:duration=14" -f lavfi -i "sine=frequency=329.6:duration=14" -filter_complex "amix=inputs=2,volume=0.6" music_a.mp3
$F -f lavfi -i "sine=frequency=392:duration=12" music_b.mp3
# 박자 맞춤 테스트용: 100 BPM 킥 + 지속음 30초
$F -f lavfi -i "aevalsrc='0.8*sin(2*PI*60*t)*exp(-mod(t-0.2\\,0.6)*25)+0.15*sin(2*PI*330*t)':d=30:s=44100" -b:a 160k music_beat.mp3
echo "fixtures ready"
