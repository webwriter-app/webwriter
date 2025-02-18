<template>
    <a v-bind:href="mailto"> {{ address }} </a>
</template>
  
<script setup lang="ts">
  import { computed } from "vue"
  const props = defineProps({
    local: String,
    domain: String
  })
  const address = computed(() => `${props.local}@${props.domain}`)
  const mailto = computed(() => `mailto:${address.value}`)
</script>