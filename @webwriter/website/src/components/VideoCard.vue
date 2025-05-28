<template>
	<section class="video-card">
		<div class="video-container" @click="playPausevideo">
			<video ref="videoRef" :src="videoSrc" muted loop preload="metadata" />
			<button class="play-pause-button">{{ videoPlaying ? "⏸︎" : "⏵︎" }}</button>
		</div>
		<div class="content">
			<h4>{{ title }}</h4>
			<slot />
		</div>
	</section>
</template>

<script lang="ts" setup>
import { defineProps, ref } from "vue";

const props = defineProps<{
	videoSrc: string;
	title: string;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const videoPlaying = ref(false);

const playPausevideo = () => {
	videoPlaying.value = !videoPlaying.value;
	if (videoPlaying.value) {
		videoRef.value?.play();
	} else {
		videoRef.value?.pause();
	}
};
</script>

<style scoped>
.video-card {
	display: flex;
	width: 100%;
	gap: 18px;

	margin: 18px 0;
}

@media screen and (max-width: 600px) {
	.video-card {
		flex-direction: column;
		align-items: center;
		gap: 0px;
	}

	/* Since there is no hover on mobile, always show the play-pause button */
	.play-pause-button {
		background-color: rgba(0, 0, 0, 0.5) !important;
	}
}

.video-container {
	width: 250px;
	height: 250px;
	overflow: hidden;
	border-radius: 8px;
	position: relative;

	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.play-pause-button {
	position: absolute;
	bottom: 12px;
	right: 12px;

	width: 32px;
	height: 32px;

	display: grid;
	place-items: center;

	background-color: transparent;
	color: white;
	border: none;
	border-radius: 100%;
	font-size: 16px;

	transition: background-color 0.3s ease;
}

.video-card:hover .play-pause-button {
	background-color: rgba(0, 0, 0, 0.5);
}

.content {
	flex: 1;
}
</style>
