import uniq from "lodash/uniq";
import sortBy from "lodash/sortBy";
import intersection from "lodash/intersection";
import without from "lodash/without";
import pick from "lodash/pick";

const fs = require("fs");
const wordListPath = require("word-list");
const wordArray = fs.readFileSync(wordListPath, "utf8").split("\n");

import { words } from "popular-english-words";
import { logToFile } from "./log_to_file";

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

type WordByRoot = {
  root: string;
  prefixes: string[];
  prefixCount: number;
  rootNumber?: number;
};

function getAllWordsByRoot(): WordByRoot[] {
  const words = popularWords;
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

type RootCondition = {
  roots: WordByRoot[];
  prefixCount: number;
};

/*

Sample set of conditions:

[
    { roots: [root1, root2], prefixCount: 2 },
    { roots: [root2], prefixCount: 1 }
]

Note: prefixesInCommon from a condition are excluded from consideration for
following conditions

*/
function applyRootConditions({
  previousWords,
  conditions,
}: {
  previousWords: WordByRoot[];
  conditions: RootCondition[];
}) {
  const wordsByRoot = getAllWordsByRoot();
  const disallowedRoots = previousWords.map((w) => w.root);

  const words = wordsByRoot
    // filter out previously matched roots
    .filter((w) => !disallowedRoots.includes(w.root))
    .map((w) => {
      let allPrefixesInCommon: string[] = [];

      const conditionMatches = conditions.map((condition) => {
        const allRoots = condition.roots;
        // find prefixes in common between all roots
        // exlucing the ones already used to match previous conditions
        const prefixesInCommon = without(
          intersection.apply(null, [
            ...allRoots.map((r) => r.prefixes),
            w.prefixes,
          ]),
          ...allPrefixesInCommon
        );

        allPrefixesInCommon = [...allPrefixesInCommon, ...prefixesInCommon];
        const prefixesInCommonCount = prefixesInCommon.length;
        const meetsCondition = prefixesInCommonCount >= condition.prefixCount;
        // note: we pick specific properties to remove prefixes to save space
        // in YAML file when logging out combinations
        const conditionWithoutPrefixes = {
          prefixCount: condition.prefixCount,
          roots: condition.roots.map((r) =>
            pick(r, ["root", "rootNumber", "prefixCount"])
          ),
        };
        return {
          ...conditionWithoutPrefixes,
          prefixesInCommon,
          prefixesInCommonCount,
          meetsCondition,
        };
      });
      return { ...w, conditionMatches };
    });

  // only keep words that meet every condition
  const validWords = words.filter((w) => {
    return w.conditionMatches.every(
      (conditionMatch) => conditionMatch.meetsCondition
    );
  });

  return validWords;
}

function findRootCombinations() {
  const wordsByRoot = getAllWordsByRoot();

  let validCombinations = [];
  for (const root1 of wordsByRoot) {
    root1.rootNumber = 1;
    // root 2 needs
    // 4 prefixes in common with root 1
    const validRoots2 = applyRootConditions({
      previousWords: [root1],
      conditions: [{ roots: [root1], prefixCount: 4 }],
    });
    if (validRoots2.length === 0) continue;

    /*
TODO: try not grouping conditions, e.g.

    root 3 needs
    1 prefix in common with roots 1 and 2
    1 different prefix in common with roots 1 and 2
    1 different prefix in common with root 2

    */

    // root 3 needs
    // 2 prefixes in common with roots 1 and 2
    // 1 prefix in common with root 2
    for (const root2 of validRoots2) {
      root2.rootNumber = 2;
      const validRoots3 = applyRootConditions({
        previousWords: [root1, root2],
        conditions: [
          { roots: [root1, root2], prefixCount: 2 },
          { roots: [root2], prefixCount: 1 },
        ],
      });
      if (validRoots3.length === 0) continue;

      // root 4 needs
      // 1 prefix in common with roots 1, 2, and 3
      // 1 prefix in common with roots 1 and 2
      // 1 prefix in common with roots 2 and 3
      // 1 prefix in common with roots 1 and 3
      // 1 prefix in common with roots 1
      // 1 prefix in common with roots 3
      for (const root3 of validRoots3) {
        root3.rootNumber = 3;
        const validRoots4 = applyRootConditions({
          previousWords: [root1, root2, root3],
          conditions: [
            { roots: [root1, root2, root3], prefixCount: 1 },
            { roots: [root1, root2], prefixCount: 1 },
            { roots: [root2, root3], prefixCount: 1 },
            { roots: [root1, root3], prefixCount: 1 },
            { roots: [root1], prefixCount: 1 },
            { roots: [root3], prefixCount: 1 },
          ],
        });
        if (validRoots4.length === 0) continue;

        for (const root4 of validRoots4) {
          root4.rootNumber = 4;
          validCombinations.push({ root1, root2, root3, root4 });
        }
      }
    }
  }
  return validCombinations;
}

const validCombinations = findRootCombinations();

console.log(`Found ${validCombinations.length} total valid combinations`);
logToFile("wordsByRoots.yml", getAllWordsByRoot());
logToFile("validCombinations.json", validCombinations);
