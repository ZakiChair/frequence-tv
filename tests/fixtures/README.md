# Deterministic player media

These fixtures are self-generated, silent 30-second blue videos (160×90, 10 fps,
H.264 baseline). They contain no third-party media and require no live broadcaster.
The browser tests intercept HTTPS fixture URLs and serve these files locally.

Recreate with ffmpeg, from this directory:

```sh
ffmpeg -f lavfi -i color=c=0x245a75:s=160x90:r=10:d=30 -c:v libx264 -pix_fmt yuv420p -profile:v baseline -g 20 -keyint_min 20 -sc_threshold 0 -an -movflags +faststart video.mp4
ffmpeg -i video.mp4 -c copy -hls_time 30 -hls_list_size 0 -hls_segment_type fmp4 hls/playlist.m3u8
ffmpeg -i video.mp4 -c copy -seg_duration 30 -use_template 1 -use_timeline 1 -f dash dash/manifest.mpd
```
