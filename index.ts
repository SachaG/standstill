import uniq from "lodash/uniq";
import sortBy from "lodash/sortBy";
import intersection from "lodash/intersection";

const fs = require("fs");
const wordListPath = require("word-list");
const wordArray = fs.readFileSync(wordListPath, "utf8").split("\n");

import { words } from "popular-english-words";

const TOP_POPULAR_WORDS = 3000;
const MINIMUM_ROOT_LENGTH = 2;
const MAX_PREFIX_LENGTH = 3;

const popularWords = words.getMostPopular(TOP_POPULAR_WORDS);

type SplitWord = {
  prefix: string;
  root: string;
};

function getSplitWords(words: string[], prefixLength: number): SplitWord[] {
  return (
    words
      // we need to make sure that the word is longer than the prefix
      .filter((w) => w.length > prefixLength)
      .map((word) => {
        const prefix = word.substring(0, prefixLength);
        const root = word.substring(prefixLength);
        return { prefix, root };
      })
  );
}

// function getWordsByPrefix(words: string[], prefixLength: number) {
//   const splitWords = getSplitWords(words, prefixLength);
//   const wordsByPrefix = uniq(splitWords.map((w) => w.prefix)).map(
//     (prefix: string) => {
//       const roots = splitWords
//         .filter((w) => w.prefix === prefix)
//         .map((w) => w.root);
//       return {
//         prefix,
//         roots,
//         rootCount: roots.length,
//       };
//     }
//   );
//   // we can discard prefixes that only have a single root attached
//   const filteredWords = wordsByPrefix.filter((w) => w.rootCount >= 2);
//   const sortedWordsByPrefix = sortBy(filteredWords, "rootCount").toReversed();
//   return sortedWordsByPrefix;
// }

type WordByRoot = {
  root: string;
  prefixes: string[];
  prefixCount: number;
};

function getWordsByRoot(words: string[]): WordByRoot[] {
  let splitWords: SplitWord[] = [];
  // for each prefix length, concatenate all split words in one big array
  for (let i = 1; i <= MAX_PREFIX_LENGTH; i++) {
    splitWords = [...splitWords, ...getSplitWords(words, i)];
  }
  const uniqueRoots = uniq(splitWords.map((w) => w.root));
  const wordsByRoot: WordByRoot[] = uniqueRoots.map((root: string) => {
    const prefixes = splitWords
      .filter((w) => w.root === root)
      .map((w) => w.prefix)
      .sort();
    return {
      root,
      prefixes,
      prefixCount: prefixes.length,
    };
  });
  const filteredWords = wordsByRoot
    // we can discard roots that have less than 6 prefixes attached
    .filter((w) => w.prefixCount >= 6)
    // and also those that are too short
    .filter((w) => w.root.length >= MINIMUM_ROOT_LENGTH);
  const sortedWordsByRoot = sortBy(filteredWords, "prefixCount").toReversed();
  return sortedWordsByRoot;
}

type ValidCombination = {
  // 4 roots
  roots: string[];
  // 9 prefixes
  prefixes: string[];
};

// for a given word, keep roots that have 4 or more of the prefixes in common with it
function filterRoots({
  wordsByRoot,
  roots,
  prefixCount,
}: {
  wordsByRoot: WordByRoot[];
  roots: WordByRoot[];
  prefixCount: number;
}) {
  const disallowedRoots = roots.map((w) => w.root);
  return (
    wordsByRoot
      // exclude the roots that have already been matched
      .filter((w) => !disallowedRoots.includes(w.root))
      // store prefixes in common
      .map((w) => {
        const commonPrefixes = roots.map((root) =>
          intersection(w.prefixes, root.prefixes)
        );
        return {
          ...w,
          commonPrefixes,
          commonPrefixesCounts: commonPrefixes.map((p) => p.length),
        };
      })
      // only keep items with more than ${prefixCount} prefixes in common for every root
      .filter((w) => w.commonPrefixesCounts.every((c) => c >= prefixCount))
  );
}

type RootCondition = {
  roots: WordByRoot[];
  prefixCount: number;
};

function applyRootConditions({
  wordsByRoot,
  previousWords,
  conditions,
}: {
  wordsByRoot: WordByRoot[];
  previousWords: WordByRoot[];
  conditions: RootCondition[];
}) {
  // { roots: [root1, root2, root3], prefixCount: 1 },
  // { roots: [root1, root2], prefixCount: 1 },
  // { roots: [root2, root3], prefixCount: 1 },
  // { roots: [root1, root3], prefixCount: 1 },
  // { roots: [root3], prefixCount: 1 },
  const disallowedRoots = previousWords.map((w) => w.root);

  //   const c = conditions.map((condition) => {
  //     const wordWithPrefixesInCommon = getWordsWithPrefixesInCommon(
  //       wordsByRoot,
  //       condition.roots
  //     );
  //     return { ...condition, wordWithPrefixesInCommon };
  //   });
  //   console.log(JSON.stringify(c, null, 2));
  const words = wordsByRoot
    // filter out previously matched roots
    .filter((w) => !disallowedRoots.includes(w.root))
    .filter((w) => {
      const m = conditions.every((condition) => {
        const wordWithPrefixesInCommon = getWordsWithPrefixesInCommon(
          wordsByRoot,
          condition.roots
        );
        return wordWithPrefixesInCommon.length > condition.prefixCount;
      });
      return m;
      //   const wordWithPrefixesInCommon = getWordsWithPrefixesInCommon(wordsByRoot, condition.roots);
      //   console.log(wordWithPrefixesInCommon)
      //   return { ...w, prefixesInCommon };
    });
  console.log(words);
  return words;
}

// for a given list of roots, find all words have prefixes in common with all of them
function getWordsWithPrefixesInCommon(
  wordsByRoot: WordByRoot[],
  roots: WordByRoot[]
) {
  const disallowedRoots = roots.map((w) => w.root);
  return (
    wordsByRoot
      // exclude the roots from the search
      .filter((w) => !disallowedRoots.includes(w.root))
      .filter((w) =>
        roots.every((r) => intersection(w.prefixes, r.prefixes).length > 0)
      )
  );
}

function findRootCombinations(words: string[]) {
  const wordsByRoot = getWordsByRoot(words);
  let validCombinations = [];
  for (const root1 of wordsByRoot) {
    // once we've picked a root, look for any other ones that have 4+ prefixes in common
    // const validRoots2 = filterRoots({
    //   wordsByRoot,
    //   roots: [root1],
    //   prefixCount: 4,
    // });
    const validRoots2 = applyRootConditions({
      wordsByRoot,
      previousWords: [root1],
      conditions: [{ roots: [root1], prefixCount: 4 }],
    });
    if (validRoots2.length === 0) break;

    // root 3 needs
    // 2 prefixes in common with roots 1/2
    // 1 in common with 2
    for (const root2 of validRoots2) {
      const validRoots3 = applyRootConditions({
        wordsByRoot,
        previousWords: [root1, root2],
        conditions: [
          { roots: [root1, root2], prefixCount: 2 },
          { roots: [root2], prefixCount: 1 },
        ],
      });
      //   const validRoots3 = filterRoots({
      //     wordsByRoot,
      //     roots: [root1, root2],
      //     prefixCount: 2,
      //   });
      if (validRoots3.length === 0) break;

      // root 4 needs
      // 1 prefix in common with roots 1/2/3
      // 1 in common with 1/2
      // 1 in common with 2/3
      // 1 in common with 1/3
      // 1 in common with 1
      // 1 in common with 3
      for (const root3 of validRoots3) {
        const validRoots4 = applyRootConditions({
          wordsByRoot,
          previousWords: [root1, root2, root3],
          conditions: [
            { roots: [root1, root2, root3], prefixCount: 1 },
            { roots: [root1, root2], prefixCount: 1 },
            { roots: [root2, root3], prefixCount: 1 },
            { roots: [root1, root3], prefixCount: 1 },
            { roots: [root3], prefixCount: 1 },
          ],
        });
        // const validRoots4 = filterRoots({
        //   wordsByRoot,
        //   roots: [root1, root2, root3],
        //   prefixCount: 3,
        // });
        if (validRoots4.length === 0) break;

        for (const root4 of validRoots4) {
          validCombinations.push([root1, root2, root3, root4]);
        }
      }
    }
  }
  console.log(validCombinations);
  console.log(`Found ${validCombinations.length} total valid combinations`);
}

function getCombinations(words: string[]) {
  // get 1-letter prefixes
  const oneLetter = getSplitWords(words, 1);
  // get 2-letter prefixes
  const twoLetter = getSplitWords(words, 1);
  // get 3-letter prefixes
  const threeLetter = getSplitWords(words, 1);
}

const wordsByRoot = getWordsByRoot(popularWords);
console.log(wordsByRoot);
console.log(`${wordsByRoot.length} total words`);

findRootCombinations(popularWords);

// const combos3 = getWordsByPrefix(popularWords, 3);
// console.log(combos3);
// console.log(`Prefix length 3: ${combos3.length} total prefixes`);

// const combos2 = getWordsByPrefix(popularWords, 2);
// console.log(combos2);
// console.log(`Prefix length 2: ${combos2.length} total prefixes`);

// const combos1 = getWordsByPrefix(popularWords, 1);
// console.log(combos1);
// console.log(`Prefix length 1: ${combos1.length} total prefixes`);

// console.log(
//   `Total prefixes: ${combos3.length + combos2.length + combos1.length}`
// );
