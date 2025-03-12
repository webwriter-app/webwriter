<template>
    <Suspense>
        <main :data-loggedin="isLoggedIn">
            <section class="explorables-list" id="explorables-private" v-if="isLoggedIn">
                <h3>{{msg("Your Explorables")}}</h3>
                <div v-for="(doc, key) in privateDocuments" v-bind:value=key>
                    <a :href="doc.fileUrl.href">
                        {{doc.prettyName}}
                    </a>
                    <span>{{doc.username}}</span>
                    <span>{{doc.localizedDateUpdated}}</span>
                </div>
                <i v-if="!privateDocuments.length">{{msg("No explorables found")}}</i>
            </section>
            <section class="explorables-list" id="explorables-community" v-if="isLoggedIn">
                <h3>{{msg("Community Explorables")}}</h3>
                <div v-for="(doc, key) in communityDocuments" v-bind:value=key>
                    <a v-bind:href="doc.fileUrl.href">
                        {{doc.prettyName}}
                    </a>
                    <span>{{doc.username}}</span>
                    <span>{{doc.localizedDateUpdated}}</span>
                </div>
                <i v-if="!communityDocuments.length">{{msg("No explorables found")}}</i>
            </section>
            <section class="explorables-list" id="explorables-public">
                <h3 v-if="isLoggedIn">{{msg("Public Explorables")}}</h3>
                <div v-for="(doc, key) in publicDocuments" v-bind:value=key>
                    <a v-bind:href="doc.fileUrl.href">
                        {{doc.prettyName}}
                    </a>
                    <span>{{doc.username}}</span>
                    <span>{{doc.localizedDateUpdated}}</span>
                </div>
                <i v-if="!publicDocuments.length">{{msg("No explorables found")}}</i>
            </section>
        </main>
    </Suspense>
</template>
  
<style scoped>

    main {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: 3rem;
        margin: 0 auto;
    }

    h3 {
        margin: 0;
    }

    .explorables-list {
        width: 100%;
        max-width: 700px;
        list-style-type: none;
        display: flex;
        flex-direction: column;
        gap: 1rem;

        & div {
            display: flex;
            gap: 1ch;
            border: 2px solid var(--sl-color-gray-950);
            padding: 0.5rem;
            background: white;

            & :first-child {
                margin-right: auto;
                font-weight: bold;
                color: inherit;
            }
        }
    }

    @media (min-width: 1500px) {

        main[data-loggedin=true] {
            flex-direction: row-reverse;
            justify-content: start;
            & :is(h3, i) {
                text-align: center;
            }
        }
    }
</style>
    
<script setup lang="ts">
import { computed, getCurrentInstance, h, onMounted, ref, watch, type Component, type PublicProps } from 'vue';
import { pocketbase } from 'src/lib/pocketbase';
import { msgResolver } from 'src/localize';

const translations = {
  "Public Explorables": {
    "de": "Öffentliche Explorables"
  },
  "Community Explorables": {
    "de": "Community-Explorables"
  },
  "Your Explorables": {
    "de": "Deine Explorables"
  },
  "No explorables found": {
    "de": "Keine Explorables gefunden"
  },
}

const lang = document.documentElement.lang
const msg = msgResolver(translations, lang)

const isLoggedIn = pocketbase.authStore.isValid

const results = await pocketbase.collection("documents").getFullList({expand: "owner", sort: "-updated"})

function capitalizeWords(str: string) {
    return str.split(" ").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")
}

const documents = results.map(entry => ({
    fileUrl: new URL(`explorables/${entry.id}`, pocketbase.baseURL),
    prettyName: capitalizeWords(entry.file.split(".").at(0).split("_").slice(0, -1).join(" ")),
    localizedDateUpdated: new Date(entry.updated).toLocaleDateString(),
    username: entry.expand?.owner.username,
    access: entry.access
}))

const privateDocuments = documents.filter(doc => doc.access === "private")
const communityDocuments = documents.filter(doc => doc.access === "community")
const publicDocuments = documents.filter(doc => doc.access === "public")

onMounted(() => {
// toggleContentEditable()
})
</script>
  
  