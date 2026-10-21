<template>
  <main>
    <h1>contact</h1>
    <OhneLink :link="{ url: '/about' }" class="about">about</OhneLink>
    <OhneLink :link="{ url: '/de/ueber', newTab: true }">ueber</OhneLink>
    <OhneLink :link="{ url: 'javascript:alert(1)' }" class="cta">unsafe</OhneLink>
    <OhneLink :link="{ collection: 'Pages', record: '01a1' }">unpublished</OhneLink>
    <NuxtLink to="/team?tags=[a%2Cb,new]" replace class="replace">team</NuxtLink>
  </main>
</template>
