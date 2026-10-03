/**
 * PC.App - the hub shell: Adventure map (worlds of fixed levels), the free-play puzzle
 * grid, navigation, timer, settings, player-name personalization,
 * animated intro slides, and the glue that connects a mounted game
 * module to SaveManager.
 *
 * Each game module registers itself with:
 *   PC.Games.register(id, {
 *     mount(container, difficulty, api) -> returns either an unmount
 *       function, or { unmount(), hint() } if the game supports hints.
 *   });
 * `api` gives the game: { win(stars, extra), lose(msg), sound, ui,
 * difficulty, playerName, elapsedMs() }
 *
 * Game modules are lazy-loaded: nothing under games/ is in index.html.
 * When a puzzle is launched, its folder is derived from its position in
 * PUZZLES (index 0 -> games/01-<id>/<id>.js + .css), the CSS is injected
 * and the JS is import()ed, which runs its register() call. So adding a
 * game is: append to PUZZLES, add games/NN-<id>/, and list it in sw.js.
 */
(function (global) {
  const PUZZLES = [
    {
      id: 'sliding', category: 'logic', name: 'Sliding Tiles', icon: '🧩', color: '#ff4d8d',
      blurb: 'Slide tiles back into order.',
      goal: "Put the numbered tiles in order - 1, 2, 3... - reading left to right, top to bottom. There's one empty gap you slide tiles into.",
      controls: 'Tap any tile that sits right next to the empty gap. That tile slides into the gap, opening a new gap where it used to be.',
      example: "If the gap is below the '5' tile, tap '5' - it slides down into the gap. Keep doing this, one tile at a time, until every number is in order.",
    },
    {
      id: 'memory', category: 'memory', name: 'Memory Match', icon: '🃏', color: '#ff9f43',
      blurb: 'Flip cards, find every pair.',
      goal: 'Every card has a hidden matching twin somewhere on the board. Find all the pairs.',
      controls: "Tap any card to flip it face-up. Then tap a second card. If they match, both stay face-up for good. If they don't, they flip back over - so remember where they were!",
      example: "You flip a card and see 🍎. Remember that spot. A few turns later you flip another card and it's also 🍎 - tap it right after and you've found the pair.",
    },
    {
      id: 'match3', category: 'memory', name: 'Color Match-3', icon: '💎', color: '#ffd93d',
      blurb: 'Swap gems, clear lines of 3+.',
      goal: 'Line up 3 or more gems of the same color in a row or column to clear them and score points, before you run out of moves.',
      controls: 'Tap one gem, then tap a gem directly next to it (up, down, left, or right) to swap their places. The swap only happens if it lines up 3 or more matching gems.',
      example: 'Two red gems sit side by side with a yellow gem next to them. Tap the yellow gem, then tap the red gem beside it to swap - if that completes a row of 3 reds, they clear!',
    },
    {
      id: 'maze', category: 'logic', name: 'Maze Runner', icon: '🏃', color: '#23d18b',
      blurb: 'Race to the exit before time runs out.',
      goal: 'Guide your character through the maze from the start to the flag 🏁 before the clock hits zero.',
      controls: 'Use the arrow keys, WASD, or tap the on-screen arrow pad to move one step at a time. Yellow walls block your path - you have to go around them.',
      example: "If a wall blocks you from moving right, try moving up or down first, then right again once you're past the wall - like finding a detour.",
    },
    {
      id: 'sokoban', category: 'logic', name: 'Block Push', icon: '📦', color: '#17c3b2',
      blurb: 'Push every crate onto its target.',
      goal: 'Push every crate 📦 onto a glowing target circle. Once all crates are on targets, you win.',
      controls: "Walk into a crate to push it one space further in that same direction. You can only push crates, never pull them - so think ahead about which side you need to be on before you start pushing.",
      example: "If a crate needs to move left, you must first walk around to stand on its right side, then move left - that pushes the crate one step left, onto or toward the target.",
    },
    {
      id: 'wordsearch', category: 'word', name: 'Word Search', icon: '🔤', color: '#3f8efc',
      blurb: 'Find every hidden word in the grid.',
      goal: 'Find every word from the list hidden inside the letter grid.',
      controls: 'Press and drag in a straight line across the letters that spell a word. Words can run left-to-right, right-to-left, up, down, or diagonally.',
      example: "If 'CAT' is hidden going downward, find the 'C', press down on it, then drag straight down through the 'A' and 'T' below it, then let go - the word highlights and is found.",
    },
    {
      id: 'merge2048', category: 'logic', name: 'Number Merge', icon: '🔢', color: '#a259ff',
      blurb: 'Merge tiles to reach the target number.',
      goal: "Combine matching numbers to build up to the target number shown at the top of the screen.",
      controls: 'Swipe (or press an arrow key) to slide every tile at once in that direction. When two tiles with the same number bump into each other, they merge into one tile worth double.',
      example: "Swipe right. If a '2' tile slides into another '2' tile, they combine into a single '4' tile. Two '4' tiles later combine into an '8', and so on.",
    },
    {
      id: 'jigsaw', category: 'logic', name: 'Jigsaw', icon: '🧩', color: '#ff5c5c',
      blurb: 'Drag pieces to rebuild the picture.',
      goal: 'Rebuild the full picture by moving every scattered piece to its correct spot on the board.',
      controls: 'Press and drag a piece from the scattered pile toward the board. When you drop it near the right outlined square, it snaps into place automatically.',
      example: "A piece shows the corner of a yellow sun. Look at the picture pieces already placed to guess roughly where the sun goes, then drag your piece there and let go - it'll snap in if you're close enough.",
    },
    {
      id: 'simon', category: 'memory', name: 'Pattern Memory', icon: '🎵', color: '#ff4d8d',
      blurb: 'Repeat the ever-growing sequence.',
      goal: 'Watch which colored pads light up in order, then tap them back in that exact same order. Every round the sequence gets one step longer - and faster.',
      controls: "Wait and watch first - don't tap anything while the pads are flashing. Once they stop, tap the pads yourself in the same order you just saw.",
      example: 'The game flashes green, then blue, then green again. Once it stops, you tap: green, blue, green - in that exact order - to complete the round.',
    },
    {
      id: 'lightsout', category: 'logic', name: 'Logic Grid', icon: '💡', color: '#ffd93d',
      blurb: 'The final boss: clear every light.',
      goal: "Turn off every single light on the grid. This is the final boss puzzle - it takes some planning.",
      controls: "Tap any light to toggle it on/off - but that same tap ALSO toggles the lights directly above, below, left, and right of it. One tap changes up to 5 lights at once.",
      example: "Tapping a lit light in the middle of the grid turns it off, but also flips its 4 neighbors - so a tap can turn OTHER lights on too. Use the Hint button if you get stuck figuring out where to tap next.",
    },
    {
      id: 'tictactoe', category: 'board', name: 'Tic-Tac-Toe', icon: '❌', color: '#ff4d8d',
      blurb: 'Outsmart the computer, three in a row wins.',
      goal: 'Get three of your marks (X) in a row - across, down, or diagonally - before the computer (O) does.',
      controls: 'Tap any empty square to place your X there. Then wait a moment while the computer places an O. Keep taking turns until someone gets three in a row, or the board fills up.',
      example: "If you already have X's in the top-left and top-middle squares, tap the top-right square to complete the row and win.",
    },
    {
      id: 'whackmole', category: 'action', name: 'Whack-a-Mole', icon: '🐹', color: '#ff9f43',
      blurb: 'Tap moles fast before time runs out.',
      goal: 'Tap enough moles to reach the target score before the timer hits zero. Watch out for red bomb moles - tapping one costs you points!',
      controls: 'Moles pop up out of random holes for a split second. Tap a brown mole as soon as you see it to score a point. Do not tap the red ones.',
      example: "A brown mole pops up in the bottom-left hole - tap it right away before it ducks back down. A red mole pops up next - leave that one alone!",
    },
    {
      id: 'connect4', category: 'board', name: 'Connect Four', icon: '🔴', color: '#ffd93d',
      blurb: 'Drop discs, connect four before the computer.',
      goal: 'Be the first to get four of your discs in a row - across, down, or diagonally - by dropping them into the grid.',
      controls: 'Tap anywhere in a column to drop your disc there. It falls to the lowest open spot in that column. Then the computer drops one of its own.',
      example: "You already have three pink discs stacked diagonally. Tap the column that would drop a fourth pink disc into the next spot on that diagonal to win.",
    },
    {
      id: 'minesweeper', category: 'logic', name: 'Minesweeper', icon: '💣', color: '#23d18b',
      blurb: 'Clear every safe square without hitting a mine.',
      goal: 'Reveal every square that is NOT a hidden mine. Numbers tell you how many mines are touching that square.',
      controls: "Tap a square to reveal it. If it's a number, that many mines touch it - use that to figure out which nearby squares are safe. Turn on Flag Mode to mark squares you're sure are mines instead of revealing them.",
      example: "You reveal a square showing '1', and one neighboring square is already flagged as a mine - that means every OTHER neighboring square is safe to tap.",
    },
    {
      id: 'hanoi', category: 'logic', name: 'Tower of Hanoi', icon: '🗼', color: '#17c3b2',
      blurb: 'Move the whole stack to the last peg.',
      goal: 'Move every disk from the left peg to the right peg, rebuilding the same stack there - biggest disk on the bottom.',
      controls: 'Tap a peg to pick up its top disk, then tap another peg to drop it there. You can never place a bigger disk on top of a smaller one.',
      example: "To move the smallest disk from the left peg to the right peg, tap the left peg (it lifts the top disk), then tap the right peg to drop it there.",
    },
    {
      id: 'pegsolitaire', category: 'logic', name: 'Peg Solitaire', icon: '🎯', color: '#3f8efc',
      blurb: 'Jump pegs away until only one remains.',
      goal: 'Jump pegs over each other to remove them from the board. Try to end with as few pegs left as possible - one is a perfect game!',
      controls: 'Tap a peg to select it, then tap an empty hole exactly two spaces away in a straight line, with another peg sitting in between. That middle peg gets removed.',
      example: "A peg sits two spaces to the left of an empty hole, with another peg in between them. Tap your peg, then tap the empty hole - it jumps over and removes the middle peg.",
    },
    {
      id: 'snake', category: 'action', name: 'Snake', icon: '🐍', color: '#a259ff',
      blurb: 'Eat food, grow long, don’t crash.',
      goal: 'Guide the snake to eat the glowing food and grow to the target length - without hitting the walls or your own tail.',
      controls: 'Swipe on the board, use the arrow keys/WASD, or tap the on-screen pad to steer. The snake keeps moving on its own - you just choose which way it turns.',
      example: "Food appears just above your snake's head. Swipe up (or tap the up arrow) to turn that direction and eat it - the snake grows one segment longer.",
    },
    {
      id: 'breakout', category: 'action', name: 'Brick Breaker', icon: '🧱', color: '#ff5c5c',
      blurb: 'Bounce the ball to clear every brick.',
      goal: 'Break every brick at the top of the screen by bouncing the ball into them with your paddle, without letting the ball fall past you.',
      controls: 'Drag left/right on the board to slide your paddle under the ball, or use the arrow keys / on-screen buttons. Tap the board to launch the ball.',
      example: "The ball is falling toward the right side of the screen - drag your paddle right to get under it before it passes, so it bounces back up into the bricks.",
    },
    {
      id: 'colorflood', category: 'logic', name: 'Color Flood', icon: '🌊', color: '#ff9f43',
      blurb: 'Flood the whole board in one color.',
      goal: 'Turn the entire board into a single color, spreading out from the top-left corner, before you run out of moves.',
      controls: 'Tap a color swatch below the board. Every square connected to the top-left corner that matches the current color (or the color you just picked) becomes that new color too.',
      example: "The top-left corner is currently blue, and a patch of green squares touches it. Tap green - that patch joins the blue region, and now the whole connected area is green, ready to grow further.",
    },
    {
      id: 'sudoku', category: 'logic', name: 'Mini Sudoku', icon: '🔷', color: '#23d18b',
      blurb: 'Fill the grid so no number repeats.',
      goal: 'Fill in every empty square so each row, column, and bold box contains every number exactly once, with no repeats.',
      controls: 'Tap an empty square to select it, then tap a number below the board to fill it in. Tap ✕ to clear a square you filled in.',
      example: "A row already has 1, 2, and 3 filled in, and it's a 4x4 board - the one empty square in that row must be a 4, since every number appears exactly once per row.",
    },
    {
      id: 'reversi', category: 'board', name: 'Reversi', icon: '⚫', color: '#242636',
      blurb: 'Outflank the computer to flip the board your color.',
      goal: 'End the game with more discs in your color than the computer. Trap enemy discs between two of yours to flip them.',
      controls: "Tap any highlighted square to place your disc there. It must trap at least one line of the computer's discs between your new disc and another one of yours - all trapped discs flip to your color.",
      example: "You're playing white and there's a black disc with a white disc right past it in a straight line. Tap the empty square right before the black disc - it flips to white, sandwiched between your two white discs.",
    },
    {
      id: 'checkers', category: 'board', name: 'Checkers', icon: '🔴', color: '#d6216b',
      blurb: 'Jump the computer’s pieces off the board.',
      goal: 'Capture all of the computer’s pieces (or trap them so they can’t move) by jumping over them diagonally.',
      controls: "Tap one of your pieces, then tap a highlighted square to move it diagonally. If an enemy piece sits diagonally next to you with an empty square right behind it, tap that empty square to jump over and capture it. Reach the far row to become a king, which can move diagonally in any direction.",
      example: "An enemy piece sits diagonally in front of yours, and the square just past it is empty. Tap that empty square - your piece jumps over the enemy piece, capturing it.",
    },
    {
      id: 'battleship', category: 'board', name: 'Battleship', icon: '🚢', color: '#3f8efc',
      blurb: 'Sink every hidden ship before the computer sinks yours.',
      goal: "Find and sink every one of the computer's hidden ships on its grid before it sinks all of yours.",
      controls: "Tap a square on the enemy grid (top) to fire at it. A hit lights up red, a miss shows a splash. The computer fires back on your grid (bottom) after every shot. Sink a whole ship by hitting every square it covers.",
      example: "You fire and get a hit (red). Ships are always in a straight line, so try the squares directly next to that hit, up/down or left/right, to find the rest of that same ship.",
    },
    {
      id: 'mastermind', category: 'logic', name: 'Code Breaker', icon: '🎯', color: '#a259ff',
      blurb: 'Crack the computer’s secret color code.',
      goal: "Figure out the secret sequence of colored pegs the computer picked, within your limited number of guesses.",
      controls: "Tap colors to fill a guess row, then submit it. A black peg means one of your pegs is the right color in the right spot; a white peg means it's the right color but the wrong spot. Use those clues to narrow down the code.",
      example: "You guess red-blue-green and get one black peg and one white peg. That means one of those colors is in exactly the right spot, and another is in the code but in a different spot - try rearranging them next guess.",
    },
    {
      id: 'nonogram', category: 'logic', name: 'Picture Logic', icon: '🖼️', color: '#ff9f43',
      blurb: 'Fill squares by the numbers to reveal a picture.',
      goal: 'Use the number clues beside each row and column to work out which squares should be filled in - fill them all correctly to reveal the hidden picture.',
      controls: "Tap a square to fill it in. Tap it again to mark it with an X (meaning 'definitely empty', just to help you keep track). The numbers next to a row show the length of each filled block in order, left to right (or top to bottom for columns).",
      example: "A row's clue is just '3' on a 5-wide row. That means somewhere in that row there's one unbroken block of 3 filled squares (with empty space around it) - use the column clues to figure out exactly where it starts.",
    },
    {
      id: 'flowconnect', category: 'logic', name: 'Pipe Flow', icon: '🌈', color: '#17c3b2',
      blurb: 'Connect matching dots without crossing any lines.',
      goal: 'Connect every pair of matching colored dots with a single path, so the whole grid ends up covered and no two paths cross.',
      controls: 'Press down on a colored dot and drag across the grid toward its matching dot. Your path follows your finger one square at a time - lift your finger once you reach the matching dot to lock the connection in.',
      example: "There are two blue dots on opposite corners. Press the first one and drag in a straight line, turning corners as needed, until you reach the second blue dot - that whole trail becomes one blue pipe.",
    },
    {
      id: 'ballsort', category: 'logic', name: 'Ball Sort', icon: '🧪', color: '#ffd93d',
      blurb: 'Sort every colored ball into its own tube.',
      goal: 'Sort the mixed-up colored balls so each tube ends up holding only one color (or stays empty).',
      controls: 'Tap a tube to lift its top ball. Then tap another tube to pour that ball in - it only works if that tube is empty or its top ball is the same color.',
      example: "A tube has a red ball on top, and another tube already has red balls at the top with room left. Tap the first tube to pick up the red ball, then tap the second tube to pour it in on top of the matching reds.",
    },
    {
      id: 'bubbleshooter', category: 'action', name: 'Bubble Pop', icon: '🫧', color: '#ff5c5c',
      blurb: 'Match 3+ bubbles of a color to pop them.',
      goal: 'Clear all the bubbles hanging above by matching 3 or more of the same color together, before they reach the bottom line.',
      controls: 'Drag on the screen to aim your bubble, then release to shoot it upward. If it touches 2 or more bubbles of the same color, that whole group pops.',
      example: "There are two yellow bubbles stuck together near the top. Aim your yellow bubble to land right next to them - all three yellow bubbles pop together, and anything hanging only from them falls too.",
    },
    {
      id: 'dotsboxes', category: 'board', name: 'Dots & Boxes', icon: '🔲', color: '#8e6bff',
      blurb: 'Claim more boxes than the computer.',
      goal: 'Claim more little boxes than the computer by being the one who draws each box’s 4th and final edge.',
      controls: "Tap a dashed line between two dots to draw it. If your line completes all 4 sides of a box, you claim that box and its color, and you get to go again. Otherwise, it becomes the computer's turn.",
      example: "A box already has 3 of its 4 edges drawn. Tap the one missing edge - that completes the box, it turns your color, and you get an extra turn to keep going.",
    },
    {
      id: 'pyramidsolitaire', category: 'logic', name: 'Pyramid Solitaire', icon: '🃏', color: '#ff4d8d',
      blurb: 'Clear the card pyramid by pairing to 13.',
      goal: "Clear every card off the pyramid by removing pairs that add up to 13 (Kings count as 13 alone, Queens as 12, Jacks as 11, Aces as 1).",
      controls: "Tap two uncovered cards whose values add up to 13 to remove both. Only cards with nothing on top of them (or the drawn card) can be tapped. Tap the draw pile to reveal a new card whenever you're stuck.",
      example: "You see an uncovered 9 and an uncovered 4 - together that's 13. Tap the 9, then tap the 4 - both vanish, uncovering whatever cards were beneath them.",
    },
    {
      id: 'tangram', category: 'logic', name: 'Shape Puzzle', icon: '🔺', color: '#23d18b',
      blurb: 'Arrange 7 shapes to fill the outline.',
      goal: 'Move, and rotate, all 7 geometric pieces so together they perfectly fill the glowing outline shape.',
      controls: "Drag a piece toward the outline. Tap a piece once (without dragging) to rotate it 45 degrees. A piece snaps into place with a satisfying click once it's close enough to its correct spot and angle.",
      example: "A triangle piece looks like it belongs in a corner of the outline, but it's pointing the wrong way. Tap it a few times to rotate it until it matches that corner's angle, then drag it into place.",
    },
    {
      id: 'anagram', category: 'word', name: 'Word Scramble', icon: '🔤', color: '#ff9f43',
      blurb: 'Unscramble the letters to spell each word.',
      goal: 'Put the scrambled letter tiles back in the right order to spell out the secret word before time or guesses run out.',
      controls: 'Tap letter tiles in the order you think spells the word. Each tap adds that letter to your answer. Tap a letter in your answer to remove it if you change your mind.',
      example: "The scrambled letters are C, T, A. Tap C, then A, then T, to spell 'CAT' in your answer row.",
    },
    {
      id: 'wordguess', category: 'word', name: 'Word Guess', icon: '📝', color: '#3f8efc',
      blurb: 'Guess the hidden word in limited tries.',
      goal: 'Figure out the secret hidden word within your limited number of guesses, using the color clues after each try.',
      controls: 'Type or tap letters on the on-screen keyboard to build a guess, then submit it. Green means that letter is correct and in the right spot. Yellow means it’s in the word but the wrong spot. Gray means it’s not in the word at all.',
      example: "You guess 'CRANE' and the 'C' turns green while the rest turn gray. That tells you the word starts with 'C' and definitely doesn't contain R, A, N, or E - try a totally different word next.",
    },
    {
      id: 'airhockey', category: 'action', name: 'Air Hockey', icon: '🏒', color: '#17c3b2',
      blurb: 'Score more goals than the computer.',
      goal: 'Score more goals than the computer by knocking the puck past its paddle and into its goal.',
      controls: 'Drag your paddle around your half of the table to hit the puck. Block shots heading toward your own goal, and strike the puck hard toward the far end to score.',
      example: "The puck is drifting toward your side. Drag your paddle to meet it, then keep dragging in the direction of the computer's goal right as you make contact to send it flying that way.",
    },
    {
      id: 'marblemaze', category: 'action', name: 'Marble Maze', icon: '🔵', color: '#a259ff',
      blurb: 'Tilt the maze to roll the marble to the goal.',
      goal: 'Guide the rolling marble through the maze from its starting spot to the glowing goal hole, avoiding dark pits along the way.',
      controls: 'Press and drag anywhere on the board to "tilt" it - the marble rolls in whichever direction you drag. Release to stop tilting.',
      example: "The marble needs to go right and there's a clear path that way. Press down and drag slightly to the right - the marble rolls in that direction until it hits a wall or you let go.",
    },
    {
      id: 'blockdrop', category: 'action', name: 'Block Drop', icon: '🟦', color: '#ff5c5c',
      blurb: 'Stack falling blocks to clear full lines.',
      goal: 'Clear a target number of full horizontal lines by fitting the falling block shapes together with no gaps.',
      controls: 'Use the on-screen left/right buttons to move the falling piece, the rotate button to spin it, and drop to send it down instantly. A full row (no empty squares) clears itself away.',
      example: "The bottom row has just one empty square left, over on the right. Move the current piece over to that gap and drop it in - if it fills the row completely, that whole row clears.",
    },
    {
      id: 'runner', category: 'action', name: 'Lane Runner', icon: '🏃‍♂️', color: '#ffd93d',
      blurb: 'Dodge obstacles to survive the distance.',
      goal: 'Keep running and dodging obstacles in your lane until you reach the target distance, without running out of lives.',
      controls: 'Tap left or right (or use the on-screen buttons) to switch lanes and dodge whatever is coming up in your current lane.',
      example: "You spot a barrier coming up dead ahead in your lane, with a clear lane to its left. Tap left just before you reach it to swerve into the empty lane and avoid a hit.",
    },
    {
      id: 'towerdefense', category: 'action', name: 'Tower Defense', icon: '🏰', color: '#8e6bff',
      blurb: 'Build towers to defend against every wave.',
      goal: 'Survive every wave of enemies marching down the path by building towers that attack them along the way.',
      controls: 'Tap an empty cell next to the path to build a tower there, spending your earned currency. Towers then attack any enemy that walks past automatically - no need to tap them each time.',
      example: "Enemies are marching down a path and a cell right beside it is empty and affordable. Tap it to place a tower there - it'll start firing automatically at every enemy that walks by.",
    },
    {
      id: 'rhythmtap', category: 'action', name: 'Rhythm Tap', icon: '🎹', color: '#ff4d8d',
      blurb: 'Tap the tiles right as they reach the line.',
      goal: 'Tap each colored tile the instant it crosses the hit line, and hit your target accuracy across the whole sequence.',
      controls: 'Tiles scroll down one of several lanes. Tap anywhere in that lane the moment a tile crosses the glowing hit line - too early or too late and you’ll miss it.',
      example: "A tile is scrolling down the second lane from the left and about to reach the hit line. Tap that lane right as it crosses the line - not before, not after - to score a hit.",
    },
    {
      id: 'dominoes', category: 'memory', name: 'Domino Match', icon: '🁣', color: '#3f8efc',
      blurb: 'Clear the board by matching domino pips.',
      goal: 'Clear every domino off the board by matching up pairs that share the same number of pips (dots).',
      controls: 'Tap one domino, then tap another domino that shares a matching pip value - both are removed from the board.',
      example: "One domino shows a 5, and another domino elsewhere on the board also shows a 5 on one of its halves. Tap the first one, then the second - both clear away together.",
    },
    {
      id: 'rushhour', category: 'logic', name: 'Traffic Jam', icon: '🚗', color: '#ff3b5c',
      blurb: 'Slide cars to free the red one.',
      goal: 'Get the red car out through the green exit on the right side of the parking lot.',
      controls: 'Press on a car and drag it. Cars only move forward and backward in the direction they point, never sideways. Long trucks work the same way.',
      example: "A blue truck stands upright right in front of the red car. Drag the truck down two spaces so the red car's row is clear, then drag the red car right through the green exit.",
    },
    {
      id: 'pipes', category: 'logic', name: 'Pipe Rotate', icon: '🚰', color: '#17c3b2',
      blurb: 'Turn pipes until water reaches every tile.',
      goal: 'Connect every pipe to the blue water pump so the water flows into every tile and every bulb lights up.',
      controls: 'Tap a pipe tile to turn it a quarter turn clockwise. Pipes that water reaches turn bright blue.',
      example: 'A bend pipe next to the pump points up and left, away from the pump. Tap it until one of its ends faces the pump - it turns blue and the water flows on to the next pipe.',
    },
    {
      id: 'blockfit', category: 'board', name: 'Block Fit', icon: '🟦', color: '#3f8efc',
      blurb: 'Fit blocks, clear full lines.',
      goal: 'Reach the target score by placing blocks. Any row or column that becomes completely full disappears and gives bonus points.',
      controls: 'Drag one of the three pieces from the tray onto the board and let go where the shadow shows. You get three new pieces when all three are used. If none of them fit anywhere, the round ends.',
      example: 'The bottom row has 5 blocks and a gap 3 squares wide. Drag a straight 3-long piece into that gap - the row fills up and clears for bonus points.',
    },
    {
      id: 'stacker', category: 'action', name: 'Tower Stack', icon: '🏗️', color: '#ff9f43',
      blurb: 'Drop blocks to build a tall tower.',
      goal: 'Stack blocks up to the green GOAL line.',
      controls: 'A block slides left and right above the tower. Tap anywhere (or the Drop button) to drop it. Any part hanging over the edge gets cut off, so the next block is smaller.',
      example: 'The block slides right. Tap just as it sits exactly over the block below - nothing gets cut and you get a Perfect. If you tap a little late, the extra bit on the right falls off.',
    },
    {
      id: 'laser', category: 'logic', name: 'Mirror Beam', icon: '🔦', color: '#ff2d6f',
      blurb: 'Bounce a laser through every crystal.',
      goal: 'Steer the laser beam so it passes through every crystal and lights them all up green.',
      controls: 'Tap a round mirror to flip it between / and \\. The beam bounces off mirrors at a right angle and passes straight through crystals.',
      example: 'The beam goes right and hits a / mirror, so it bounces up, away from a crystal below it. Tap that mirror to flip it to \\ - now the beam bounces down through the crystal.',
    },
    {
      id: 'hashi', category: 'logic', name: 'Bridges', icon: '🌉', color: '#3f8efc',
      blurb: 'Connect the islands with bridges.',
      goal: 'Each island shows a number. Give every island exactly that many bridges, and join all the islands into one group. Bridges go straight and can never cross.',
      controls: 'Tap one island, then tap another island in a straight line from it (up, down, left or right). Tap the same two again for a double bridge. A third time removes it. Islands turn green when they have the right count.',
      example: "An island shows 2 and the island to its right shows 1. Tap the 2, then the 1: a bridge appears and the 1 turns green. The 2 still needs one more bridge, so connect it to another neighbor.",
    },
    {
      id: 'kenken', category: 'logic', name: 'Math Cages', icon: '➗', color: '#a259ff',
      blurb: 'Fill the grid so every cage adds up.',
      goal: 'Fill every square so each row and column uses each number once. The small number in each outlined cage tells you what its numbers must make with the sign shown.',
      controls: 'Tap a square on the board, then tap a number button below. The red X button clears a square. Red squares mean a number repeats in a row or column.',
      example: "A two-square cage says 5+. On a 4x4 board that could be 1 and 4, or 2 and 3. If the row already has a 4, try 2 and 3 instead.",
    },
    {
      id: 'minigolf', category: 'action', name: 'Mini Golf', icon: '⛳', color: '#23d18b',
      blurb: 'Putt the ball into the cup.',
      goal: 'Get the ball into the cup with the flag in as few hits as you can. Fewer hits than par earns more stars.',
      controls: 'Put your finger anywhere and pull back, like a slingshot. The arrow shows where the ball will go and how hard. Let go to putt. The ball bounces off walls.',
      example: 'The cup is straight ahead. Pull your finger straight down about half the screen and let go: the ball rolls up toward the cup. Pull less for a softer putt.',
    },
    {
      id: 'mahjong', category: 'board', name: 'Tile Match', icon: '🀄', color: '#ff9f43',
      blurb: 'Clear the stack in matching pairs.',
      goal: 'Remove every tile by matching pairs with the same picture.',
      controls: 'Tap a bright tile, then tap another bright tile with the same picture. Dim tiles are stuck because something is on top of them or both sides are blocked. Shuffle mixes the tiles if you get stuck.',
      example: 'You see two bright tiles with a strawberry. Tap one, then the other: both fly away, and the tiles they were covering become bright.',
    },
    {
      id: 'spotdiff', category: 'memory', name: 'Spot the Difference', icon: '🔍', color: '#ff4d8d',
      blurb: 'Find what changed in the picture.',
      goal: 'The two pictures look the same, but the bottom one has a few changes. Find them all before you run out of wrong taps.',
      controls: 'Tap the spot that is different, in either picture. A yellow circle marks it on both. Wrong taps are limited, so look carefully first.',
      example: 'The top picture has a pink star and the bottom one has a blue star in the same spot. Tap that star and a circle appears around it in both pictures.',
    },
  ];


  /* -------------------- Adventure map: worlds + fixed levels -------------------- */

  // Like a Candy Crush saga map: an endless run of levels grouped into
  // themed worlds of 12. Every level is a FIXED game + difficulty (no
  // roulette), so "Level 14" is always the same challenge and can be
  // replayed for more stars. All 50 games are also always open in the
  // All Games tab - the map is the guided journey, not a lock.
  const LEVELS_PER_WORLD = 12;
  const WORLD_THEMES = [
    { name: 'Candy Meadow', icon: '🍭', c1: '#ff7eb3', c2: '#ffb36b', decor: ['🍭', '🍬', '🌸', '🧁', '🍩'] },
    { name: 'Lemon Lagoon', icon: '🍋', c1: '#14b8a6', c2: '#fde047', decor: ['🍋', '🌴', '🐠', '🌊', '🐚'] },
    { name: 'Berry Woods', icon: '🫐', c1: '#7c3aed', c2: '#ec4899', decor: ['🫐', '🍓', '🌲', '🍄', '🦊'] },
    { name: 'Frosty Peaks', icon: '❄️', c1: '#3b82f6', c2: '#a5f3fc', decor: ['❄️', '⛄', '🏔️', '🐧', '🎿'] },
    { name: 'Coral Reef', icon: '🐙', c1: '#0ea5e9', c2: '#fb7185', decor: ['🐙', '🐠', '🪸', '🐚', '🐢'] },
    { name: 'Volcano Valley', icon: '🌋', c1: '#dc2626', c2: '#f59e0b', decor: ['🌋', '🔥', '🦖', '🪨', '🌶️'] },
    { name: 'Starlight Sky', icon: '🌙', c1: '#1e1b4b', c2: '#7e22ce', decor: ['⭐', '🌙', '🪐', '✨', '🚀'] },
    { name: 'Crystal Caves', icon: '💎', c1: '#0f766e', c2: '#818cf8', decor: ['💎', '🔮', '🦇', '🕯️', '⛏️'] },
    { name: 'Sunset Desert', icon: '🌵', c1: '#ea580c', c2: '#facc15', decor: ['🌵', '🐪', '☀️', '🏜️', '🦂'] },
    { name: 'Rainbow Castle', icon: '🏰', c1: '#a855f7', c2: '#f472b6', decor: ['🏰', '🌈', '🦄', '👑', '🎠'] },
  ];
  // World 1 opens with the gentlest, most familiar games.
  const FIRST_WORLD_GAMES = ['sliding', 'memory', 'tictactoe', 'lightsout', 'colorflood', 'match3', 'whackmole', 'hanoi', 'connect4', 'wordsearch', 'pipes', 'merge2048'];
  const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: '🔥 Hard' };

  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(list, seed) {
    const rand = seededRandom(seed);
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Each "cycle" visits every game once, in a fixed per-cycle order, and
  // two neighbouring levels never share a game.
  const levelGameIds = [];
  function gameIdForLevel(level) {
    const n = PUZZLES.length;
    while (levelGameIds.length < level) {
      const cycle = levelGameIds.length / n;
      const ids = PUZZLES.map((p) => p.id);
      let order;
      if (cycle === 0) {
        const first = FIRST_WORLD_GAMES.filter((id) => ids.includes(id));
        order = first.concat(seededShuffle(ids.filter((id) => !first.includes(id)), 1001));
      } else {
        order = seededShuffle(ids, 1001 + cycle * 7919);
      }
      const prev = levelGameIds[levelGameIds.length - 1];
      if (prev && order[0] === prev) [order[0], order[1]] = [order[1], order[0]];
      levelGameIds.push(...order);
    }
    return levelGameIds[level - 1];
  }

  function difficultyForLevel(level) {
    const w = Math.floor((level - 1) / LEVELS_PER_WORLD);
    const p = (level - 1) % LEVELS_PER_WORLD;
    if (p === LEVELS_PER_WORLD - 1) return 'hard'; // every world ends on a finale
    if (w === 0) return p < 8 ? 'easy' : 'medium';
    if (w === 1) return p < 4 ? 'easy' : p < 9 ? 'medium' : 'hard';
    if (w === 2) return p < 2 ? 'easy' : p < 7 ? 'medium' : 'hard';
    return p < 5 ? 'medium' : 'hard';
  }

  function levelInfo(level) {
    const id = gameIdForLevel(level);
    const index = PUZZLES.findIndex((p) => p.id === id);
    const world = Math.floor((level - 1) / LEVELS_PER_WORLD);
    const pos = (level - 1) % LEVELS_PER_WORLD;
    return { level, puzzle: PUZZLES[index], index, world, pos, difficulty: difficultyForLevel(level), finale: pos === LEVELS_PER_WORLD - 1 };
  }

  function worldTheme(w) {
    const t = WORLD_THEMES[w % WORLD_THEMES.length];
    const lap = Math.floor(w / WORLD_THEMES.length);
    const roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
    return Object.assign({}, t, { name: t.name + (lap ? (roman[lap] || ` ${lap + 1}`) : '') });
  }

  function worldStars(w) {
    let got = 0;
    for (let l = w * LEVELS_PER_WORLD + 1; l <= (w + 1) * LEVELS_PER_WORLD; l++) {
      const h = save.getLevelHistory(l);
      if (h) got += h.stars || 0;
    }
    return { got, max: LEVELS_PER_WORLD * 3 };
  }

  function hasPlayedGame(puzzle) {
    const entry = save.ensurePuzzle(puzzle.id);
    return PC.DIFFICULTIES.some((d) => entry.tiers[d] && entry.tiers[d].plays > 0);
  }

  // Free Play filter chips. A puzzle's `category` must be one of the ids
  // below (except 'all' / 'favorites', which are virtual). A puzzle with no
  // category still shows under All, Favorites and search.
  const CATEGORIES = [
    { id: 'all', label: 'All', icon: '🎲' },
    { id: 'favorites', label: 'Favorites', icon: '⭐' },
    { id: 'logic', label: 'Logic', icon: '🧠' },
    { id: 'word', label: 'Word', icon: '🔤' },
    { id: 'board', label: 'Board & vs AI', icon: '♟️' },
    { id: 'action', label: 'Action & Reflex', icon: '⚡' },
    { id: 'memory', label: 'Memory & Pattern', icon: '🔁' },
  ];

  const RESTART_CONFIRM_AFTER_MS = 10000;

  const Games = { _registry: {}, register(id, def) { this._registry[id] = def; }, get(id) { return this._registry[id]; } };
  global.PC.Games = Games; // exposed immediately: game modules call register() as soon as they're imported

  const save = global.PC.SaveManager;
  const sound = global.PC.SoundManager;
  const UI = global.PC.UI;

  const WIN_PHRASES = ['Nice work', 'Great job', 'Awesome', 'You crushed it', 'Well played', 'Fantastic', 'Brilliant'];
  const WELCOME_PHRASES = ['Welcome back', 'Good to see you', 'Hey there', 'Ready to play'];

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function playerName() { return save.getPlayerName() || 'Puzzler'; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let els = {};
  let justReachedLevel = null; // set when a win advances the map, so the new node can pop in
  let currentGameUnmount = null;
  let currentGameHint = null;
  let currentRound = null; // { puzzle, def, difficulty, index, meta } while a game is mounted
  let hintCooldown = false;
  let timerInterval = null;
  let timerStart = 0;
  let timerPausedAt = null; // set while the page is hidden so backgrounded time doesn't count
  // Bumped on every navigation (launch / exit). Async work (module loads,
  // intro fade) checks it so a stale callback can't pop a game
  // onto the screen after the player already backed out.
  let navToken = 0;
  let ignoreNextPop = false;
  const gridFilter = { cat: 'all', q: '' };

  function byId(id) { return document.getElementById(id); }

  /* -------------------- Lazy game loading -------------------- */

  // Game folders are numbered by position in PUZZLES: index 0 -> games/01-<id>/<id>.js
  function gameBasePath(puzzle, index) {
    const folder = String(index + 1).padStart(2, '0') + '-' + puzzle.id;
    return `games/${folder}/${puzzle.id}`;
  }

  const loadPromises = {};
  const loadedIds = new Set();

  function loadGameCss(puzzle, href) {
    return new Promise((resolve) => {
      const existing = document.querySelector(`link[data-pc-game-css="${puzzle.id}"]`)
        || Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((l) => l.getAttribute('href') === href);
      if (existing) { resolve(); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.pcGameCss = puzzle.id;
      // A missing/slow stylesheet should never block the game from starting.
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 4000);
      link.onload = done;
      link.onerror = done;
      document.head.appendChild(link);
    });
  }

  function ensureGameLoaded(puzzle, index) {
    if (loadPromises[puzzle.id]) return loadPromises[puzzle.id];
    const base = gameBasePath(puzzle, index);
    const jsUrl = new URL(base + '.js', document.baseURI).href;
    const promise = Promise.all([
      loadGameCss(puzzle, base + '.css'),
      Games.get(puzzle.id) ? Promise.resolve() : import(jsUrl),
    ]).then(() => {
      const def = Games.get(puzzle.id);
      if (!def) throw new Error(`Game "${puzzle.id}" loaded but did not register`);
      loadedIds.add(puzzle.id);
      return def;
    });
    loadPromises[puzzle.id] = promise;
    promise.catch(() => { delete loadPromises[puzzle.id]; });
    return promise;
  }

  function prefetchGame(puzzle, index) {
    ensureGameLoaded(puzzle, index).catch(() => {});
  }

  // Runs onReady(def) once the puzzle's module + CSS are in, showing a
  // small loading state in the stage if that takes more than an instant.
  function withGame(puzzle, index, onReady) {
    const token = navToken;
    const def = Games.get(puzzle.id);
    if (def && loadedIds.has(puzzle.id)) { onReady(def); return; }
    showStageMessage(`<div class="pc-loading-spinner" aria-hidden="true"></div><div>Loading ${escapeHtml(puzzle.name)}...</div>`, 'pc-stage-msg--loading');
    ensureGameLoaded(puzzle, index).then((loadedDef) => {
      if (token !== navToken) return;
      onReady(loadedDef);
    }).catch((err) => {
      console.warn('[PC] failed to load game', puzzle.id, err);
      if (token !== navToken) return;
      showStageMessage(`
        <div style="font-size:2rem">📡</div>
        <div>Couldn't load ${escapeHtml(puzzle.name)}.<br>Check your connection and try again.</div>
        <div class="pc-stage-msg-actions">
          <button class="pc-btn pc-btn--green" data-act="retry">Try again</button>
          <button class="pc-btn pc-btn--ghost" data-act="hub">Back to hub</button>
        </div>`);
      els.gameStage.querySelector('[data-act="retry"]').addEventListener('click', () => { sound.click(); withGame(puzzle, index, onReady); });
      els.gameStage.querySelector('[data-act="hub"]').addEventListener('click', exitToHub);
    });
  }

  function showStageMessage(html, extraClass) {
    els.gameStage.innerHTML = `<div class="pc-stage-msg ${extraClass || ''}">${html}</div>`;
  }

  /* -------------------- Init -------------------- */

  function init() {
    els = {
      header: byId('pc-header'),
      hub: byId('pc-hub'),
      gameView: byId('pc-game-view'),
      grid: byId('pc-puzzle-grid'),
      gridEmpty: byId('pc-grid-empty'),
      chips: byId('pc-filter-chips'),
      search: byId('pc-search'),
      continueBtn: byId('pc-continue'),
      progressFill: byId('pc-progress-fill'),
      progressLabel: byId('pc-progress-label'),
      streakLabel: byId('pc-streak-label'),
      greeting: byId('pc-greeting'),
      settingsBtn: byId('pc-settings-btn'),
      backBtn: byId('pc-back-btn'),
      restartBtn: byId('pc-restart-btn'),
      hintBtn: byId('pc-hint-btn'),
      gameTitle: byId('pc-game-title'),
      gameTimer: byId('pc-game-timer'),
      gameStage: byId('pc-game-stage'),
      difficultyBar: byId('pc-difficulty-bar'),
      tabPath: byId('pc-tab-path'),
      tabFree: byId('pc-tab-free'),
      panelPath: byId('pc-panel-path'),
      panelFree: byId('pc-panel-free'),
      levelPath: byId('pc-level-path'),
      mapPlay: byId('pc-map-play'),
      app: document.querySelector('.pc-app'),
      statStars: byId('pc-stat-stars'),
      statStreak: byId('pc-stat-streak'),
      statWorld: byId('pc-stat-world'),
    };

    document.addEventListener('pointerdown', () => sound.resume(), { once: true });

    els.settingsBtn.addEventListener('click', openSettings);
    els.backBtn.addEventListener('click', exitToHub);
    els.hintBtn.addEventListener('click', useHint);
    if (els.restartBtn) els.restartBtn.addEventListener('click', requestRestart);
    els.tabPath.addEventListener('click', () => { sound.click(); switchTab('path'); });
    els.tabFree.addEventListener('click', () => { sound.click(); switchTab('free'); });
    if (els.continueBtn) els.continueBtn.addEventListener('click', continueLastPlayed);
    if (els.mapPlay) els.mapPlay.addEventListener('click', () => { sound.click(); openLevelPreview(save.getCurrentLevel()); });
    if (els.search) {
      els.search.addEventListener('input', () => { gridFilter.q = els.search.value; applyGridFilter(); });
      els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.search.blur(); });
    }
    renderFilterChips();

    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', onVisibilityChange);

    renderHub();
    sound.syncMusicWithSetting();

    if (!save.getPlayerName()) {
      setTimeout(promptForName, 400);
    }

    checkForUpdates();

    global.PC.App = { PUZZLES, CATEGORIES, Games, launch: launchPuzzle, launchLevel, loadGame: ensureGameLoaded };
  }

  function checkForUpdates() {
    if (!global.PC.UpdateChecker) return;
    global.PC.UpdateChecker.check().then((result) => {
      if (result && result.isNewer) {
        UI.toast(`✨ Updated to v${result.remote.version} - tap Settings > What's New`, { duration: 3200 });
      }
    }).catch(() => {});
  }

  /* -------------------- Back button / history -------------------- */

  // Entering the game view (difficulty pick, intro, or a round)
  // pushes one history entry, so the Android hardware back button (which
  // the Capacitor WebView maps to history.back() when it can) and the
  // browser back button return to the hub instead of leaving the app.
  function pushGameHistory() {
    try {
      if (history.state && history.state.pcView === 'game') return;
      // Coming from a level preview: reuse its entry so one back press
      // still lands on the map.
      if (history.state && history.state.pcView === 'preview') { history.replaceState({ pcView: 'game' }, ''); return; }
      history.pushState({ pcView: 'game' }, '');
    } catch (e) { /* history unavailable - back button just won't be intercepted */ }
  }

  function onPopState() {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    const inGame = !els.gameView.hidden;
    if (UI.hasOpenModal && UI.hasOpenModal()) {
      UI.closeTopModal();
      // Back closed a modal; stay on the current screen.
      if (inGame && !els.gameView.hidden) pushGameHistory();
      return;
    }
    if (inGame) teardownToHub();
  }

  /* -------------------- Pause when backgrounded -------------------- */

  function onVisibilityChange() {
    if (document.hidden) {
      pauseTimer();
      sound.pauseForHidden();
    } else {
      resumeTimer();
      sound.resumeFromHidden();
    }
  }

  /* -------------------- Hub -------------------- */

  function switchTab(tab) {
    const isPath = tab === 'path';
    els.tabPath.classList.toggle('is-active', isPath);
    els.tabFree.classList.toggle('is-active', !isPath);
    els.tabPath.setAttribute('aria-selected', String(isPath));
    els.tabFree.setAttribute('aria-selected', String(!isPath));
    els.panelPath.hidden = !isPath;
    els.panelFree.hidden = isPath;
    if (isPath) centerCurrentLevel();
  }

  function renderGreeting() {
    const name = save.getPlayerName();
    els.greeting.textContent = name ? `${pick(WELCOME_PHRASES)}, ${name}! \u{1F44B}` : '';
    els.greeting.hidden = !name;
  }

  function promptForName(isEdit) {
    const modalRef = UI.modal({
      title: isEdit ? 'Change your name' : "What's your name?",
      bodyHtml: `
        <p style="margin:0 0 12px;color:rgba(36,20,54,0.75);">${isEdit ? "We'll use it to cheer you on and personalize your hints." : "We'll use it to cheer you on, give you personalized hints, and celebrate your wins!"}</p>
        <input type="text" id="pc-name-input" class="pc-text-input" maxlength="24" placeholder="Type your name..." autocomplete="given-name" enterkeyhint="done"
          value="${(save.getPlayerName() || '').replace(/"/g, '&quot;')}">
      `,
      buttons: [
        { label: isEdit ? 'Save' : "Let's Play! \u{1F3AE}", className: 'pc-btn--green', close: false, onClick: submit },
      ],
    });
    const input = modalRef.el.querySelector('#pc-name-input');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    function submit() {
      const name = save.setPlayerName(input.value || 'Puzzler');
      renderGreeting();
      UI.toast(`Hi, ${name || 'Puzzler'}! \u{1F44B}`);
      modalRef.close();
    }
  }

  function renderHub() {
    const { total, max } = save.totalStars(3, PUZZLES.map((p) => p.id));
    const pct = save.completionPercent(PUZZLES.map((p) => p.id));
    els.progressFill.style.width = pct + '%';
    els.progressLabel.textContent = `${pct}% complete  •  ${total}/${max} ★`;

    renderGreeting();
    if (els.app) els.app.classList.add('is-hub');

    const current = save.getCurrentLevel();
    const curWorld = Math.floor((current - 1) / LEVELS_PER_WORLD);
    if (els.statStars) els.statStars.textContent = String(save.totalLevelStars());
    if (els.statStreak) els.statStreak.textContent = String(save.getStreak().current || 0);
    if (els.statWorld) els.statWorld.textContent = `${worldTheme(curWorld).icon} ${curWorld + 1}-${((current - 1) % LEVELS_PER_WORLD) + 1}`;

    const streak = save.getStreak();
    els.streakLabel.textContent = streak.current > 0
      ? `🔥 ${streak.current} day streak (best ${streak.best})`
      : `Play today to start a streak!`;

    renderContinue();
    renderLevelPath();
    renderGrid();
  }

  /* -------------------- Continue (last played) -------------------- */

  function lastPlayedTarget() {
    const lp = save.getLastPlayed && save.getLastPlayed();
    if (!lp) return null;
    const index = PUZZLES.findIndex((p) => p.id === lp.id);
    if (index < 0 || !save.isUnlocked(lp.id, index)) return null;
    const difficulty = PC.DIFFICULTIES.includes(lp.difficulty) ? lp.difficulty : 'easy';
    return { puzzle: PUZZLES[index], index, difficulty };
  }

  function renderContinue() {
    if (!els.continueBtn) return;
    const t = lastPlayedTarget();
    els.continueBtn.hidden = !t;
    if (!t) return;
    els.continueBtn.style.setProperty('--tile-color', t.puzzle.color);
    els.continueBtn.innerHTML = `
      <span class="pc-continue-play" aria-hidden="true">▶</span>
      <span class="pc-continue-text">
        <span class="pc-continue-label">Continue</span>
        <span class="pc-continue-name">${t.puzzle.icon} ${escapeHtml(t.puzzle.name)} · <span class="pc-continue-diff">${t.difficulty}</span></span>
      </span>`;
    els.continueBtn.setAttribute('aria-label', `Continue: ${t.puzzle.name}, ${t.difficulty}`);
  }

  function continueLastPlayed() {
    const t = lastPlayedTarget();
    if (!t) return;
    sound.click();
    launchPuzzle(t.puzzle, t.index, { difficulty: t.difficulty });
  }

  /* -------------------- Free Play grid: filters, search, favorites -------------------- */

  function renderFilterChips() {
    if (!els.chips) return;
    els.chips.innerHTML = '';
    CATEGORIES.forEach((c) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pc-filter-chip' + (gridFilter.cat === c.id ? ' is-active' : '');
      chip.dataset.cat = c.id;
      chip.setAttribute('aria-pressed', String(gridFilter.cat === c.id));
      chip.innerHTML = `<span aria-hidden="true">${c.icon}</span> ${escapeHtml(c.label)}<span class="pc-chip-count"></span>`;
      chip.addEventListener('click', () => {
        sound.click();
        gridFilter.cat = c.id;
        els.chips.querySelectorAll('.pc-filter-chip').forEach((el) => {
          const on = el.dataset.cat === c.id;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', String(on));
        });
        applyGridFilter();
      });
      els.chips.appendChild(chip);
    });
  }

  function updateFavoritesChipCount() {
    if (!els.chips) return;
    const chip = els.chips.querySelector('[data-cat="favorites"] .pc-chip-count');
    if (!chip) return;
    const n = save.getFavorites ? save.getFavorites().length : 0;
    chip.textContent = n ? ` (${n})` : '';
  }

  function renderGrid() {
    els.grid.innerHTML = '';
    PUZZLES.forEach((puzzle, index) => {
      const unlocked = save.isUnlocked(puzzle.id, index);
      const entry = save.ensurePuzzle(puzzle.id);
      if (index === 0) entry.unlocked = true;

      const bestStars = Math.max(entry.tiers.easy.bestStars, entry.tiers.medium.bestStars, entry.tiers.hard.bestStars);
      const prev = PUZZLES[index - 1];
      const fav = unlocked && save.isFavorite && save.isFavorite(puzzle.id);

      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'pc-tile pc-panel' + (unlocked ? '' : ' pc-tile--locked');
      tile.dataset.id = puzzle.id;
      tile.dataset.index = String(index);
      tile.style.setProperty('--tile-color', puzzle.color);
      tile.innerHTML = `
        <div class="pc-tile-num">${index + 1}</div>
        ${unlocked ? `<span class="pc-fav-btn${fav ? ' is-fav' : ''}" role="button" tabindex="0" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${fav ? '★' : '☆'}</span>` : ''}
        <div class="pc-tile-icon">${unlocked ? puzzle.icon : '🔒'}</div>
        <div class="pc-tile-name">${puzzle.name}</div>
        <div class="pc-tile-blurb">${unlocked ? puzzle.blurb : `Win any round of ${prev ? escapeHtml(prev.name) : 'the previous puzzle'} to unlock`}</div>
        ${unlocked ? `<div class="pc-tile-stars">${UI.starsMarkup(bestStars)}</div>` : ''}
      `;
      if (unlocked) {
        tile.addEventListener('click', (e) => {
          const favBtn = e.target.closest('.pc-fav-btn');
          if (favBtn) { e.stopPropagation(); toggleFavorite(puzzle, favBtn); return; }
          sound.click();
          launchPuzzle(puzzle, index);
        });
        const favBtn = tile.querySelector('.pc-fav-btn');
        favBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleFavorite(puzzle, favBtn); }
        });
      } else {
        tile.disabled = true;
        tile.setAttribute('aria-label', `${puzzle.name} - locked`);
      }
      els.grid.appendChild(tile);
    });
    updateFavoritesChipCount();
    applyGridFilter();
  }

  function toggleFavorite(puzzle, favBtn) {
    const on = save.toggleFavorite(puzzle.id);
    sound.select();
    if (on && sound.vibrate) sound.vibrate(10);
    favBtn.classList.toggle('is-fav', on);
    favBtn.textContent = on ? '★' : '☆';
    favBtn.setAttribute('aria-pressed', String(on));
    favBtn.setAttribute('aria-label', `${on ? 'Remove from' : 'Add to'} favorites`);
    UI.toast(on ? `⭐ Added ${puzzle.name} to Favorites` : `Removed ${puzzle.name} from Favorites`, { duration: 1200 });
    updateFavoritesChipCount();
    if (gridFilter.cat === 'favorites') applyGridFilter();
  }

  function applyGridFilter() {
    const q = gridFilter.q.trim().toLowerCase();
    const favs = new Set(save.getFavorites ? save.getFavorites() : []);
    let shown = 0;
    els.grid.querySelectorAll('.pc-tile').forEach((tile) => {
      const puzzle = PUZZLES[Number(tile.dataset.index)];
      if (!puzzle) return;
      let ok = true;
      if (gridFilter.cat === 'favorites') ok = favs.has(puzzle.id) && !tile.disabled;
      else if (gridFilter.cat !== 'all') ok = puzzle.category === gridFilter.cat;
      if (ok && q) {
        const cat = CATEGORIES.find((c) => c.id === puzzle.category);
        const hay = `${puzzle.name} ${puzzle.blurb} ${cat ? cat.label : ''} ${puzzle.id}`.toLowerCase();
        ok = hay.includes(q);
      }
      tile.hidden = !ok;
      if (ok) shown++;
    });
    if (!els.gridEmpty) return;
    els.gridEmpty.hidden = shown > 0;
    if (shown > 0) return;
    if (q) {
      els.gridEmpty.innerHTML = `🔍 No games match "<b>${escapeHtml(gridFilter.q.trim())}</b>"${gridFilter.cat !== 'all' ? ' in this category' : ''}.<br><button type="button" class="pc-btn pc-btn--ghost pc-empty-btn" data-act="clear">Clear search</button>`;
    } else if (gridFilter.cat === 'favorites') {
      els.gridEmpty.innerHTML = 'No favorites yet. Tap the ☆ on any unlocked game to pin it here.';
    } else {
      els.gridEmpty.textContent = 'No games in this category yet.';
    }
    const clear = els.gridEmpty.querySelector('[data-act="clear"]');
    if (clear) clear.addEventListener('click', () => { sound.click(); els.search.value = ''; gridFilter.q = ''; applyGridFilter(); });
  }

  /* -------------------- Adventure map -------------------- */

  const MAP_STEP = 100;      // vertical px between level nodes
  const MAP_PAD_BOTTOM = 70; // space under a world's first node
  const MAP_BANNER = 150;    // space above a world's last node for its sign

  function nodeX(world, pos) {
    return 50 + 27 * Math.sin(pos * 0.95 + world * 1.7);
  }

  // Smooth curve through points (Catmull-Rom -> cubic Bezier).
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function starRow(stars, cls) {
    return `<span class="${cls}">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'is-lit' : ''}">★</span>`).join('')}</span>`;
  }

  function buildWorldSection(w, current) {
    const theme = worldTheme(w);
    const firstLevel = w * LEVELS_PER_WORLD + 1;
    const H = MAP_PAD_BOTTOM + (LEVELS_PER_WORLD - 1) * MAP_STEP + MAP_BANNER;
    const worldLocked = firstLevel > current;
    const section = document.createElement('section');
    section.className = 'pc-world' + (worldLocked ? ' pc-world--locked' : '');
    section.style.height = H + 'px';
    section.style.setProperty('--w1', theme.c1);
    section.style.setProperty('--w2', theme.c2);
    section.dataset.world = String(w);

    const pts = [];
    for (let i = 0; i < LEVELS_PER_WORLD; i++) pts.push([nodeX(w, i), H - MAP_PAD_BOTTOM - i * MAP_STEP]);
    const full = [[50, H]].concat(pts, [[50, 0]]);
    // Bright "travelled" stretch: from the bottom edge up to the current node (or the whole world if finished).
    const reachedIdx = Math.min(LEVELS_PER_WORLD - 1, current - firstLevel);
    const done = reachedIdx < 0 ? [] : [[50, H]].concat(pts.slice(0, reachedIdx + 1), current > firstLevel + LEVELS_PER_WORLD - 1 ? [[50, 0]] : []);

    // Scenery: a few themed props scattered on the side away from the path.
    const rand = seededRandom(5000 + w * 131);
    let decor = '';
    for (let k = 0; k < 9; k++) {
      const y = MAP_PAD_BOTTOM * 0.4 + rand() * (H - MAP_BANNER * 0.6);
      const i = Math.max(0, Math.min(LEVELS_PER_WORLD - 1, Math.round((H - MAP_PAD_BOTTOM - y) / MAP_STEP)));
      const px = nodeX(w, i);
      const x = px > 50 ? 6 + rand() * 16 : 78 + rand() * 16;
      const size = 26 + Math.round(rand() * 18);
      decor += `<span class="pc-decor" style="left:${x.toFixed(1)}%;top:${y.toFixed(0)}px;font-size:${size}px;animation-delay:${(rand() * -4).toFixed(2)}s" aria-hidden="true">${theme.decor[k % theme.decor.length]}</span>`;
    }

    const { got, max } = worldStars(w);
    const banner = worldLocked
      ? `<div class="pc-world-banner is-locked"><div class="pc-world-num">World ${w + 1}</div><div class="pc-world-name">🔒 ${escapeHtml(theme.name)}</div><div class="pc-world-sub">Finish World ${w} to open</div></div>`
      : `<div class="pc-world-banner"><div class="pc-world-num">World ${w + 1}</div><div class="pc-world-name">${theme.icon} ${escapeHtml(theme.name)}</div><div class="pc-world-sub">⭐ ${got} / ${max}</div></div>`;

    section.innerHTML = `
      <svg class="pc-world-svg" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path class="pc-trail-shadow" d="${smoothPath(full)}" vector-effect="non-scaling-stroke"/>
        <path class="pc-trail" d="${smoothPath(full)}" vector-effect="non-scaling-stroke"/>
        ${done.length > 1 ? `<path class="pc-trail-done" d="${smoothPath(done)}" vector-effect="non-scaling-stroke"/>` : ''}
        <path class="pc-trail-dots" d="${smoothPath(full)}" vector-effect="non-scaling-stroke"/>
      </svg>
      ${decor}
      ${banner}`;

    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const level = firstLevel + i;
      const info = levelInfo(level);
      const hist = save.getLevelHistory(level);
      const node = document.createElement('button');
      node.type = 'button';
      let cls = 'pc-map-node';
      if (level < current) cls += ' pc-map-node--done';
      else if (level === current) cls += ' pc-map-node--current';
      else cls += ' pc-map-node--locked';
      if (info.difficulty === 'hard') cls += ' pc-map-node--hard';
      if (info.finale) cls += ' pc-map-node--finale';
      if (level === justReachedLevel) cls += ' is-new';
      node.className = cls;
      node.style.left = pts[i][0].toFixed(2) + '%';
      node.style.top = pts[i][1] + 'px';
      node.dataset.level = String(level);
      const stars = hist ? hist.stars : 0;
      node.innerHTML = `
        ${level < current ? starRow(stars, 'pc-node-stars') : ''}
        ${level === current ? `<span class="pc-avatar" aria-hidden="true">${escapeHtml((playerName()[0] || '🙂').toUpperCase())}</span>` : ''}
        <span class="pc-node-num">${level}</span>
        ${level <= current ? `<span class="pc-node-game" aria-hidden="true">${info.puzzle.icon}</span>` : ''}
        ${info.finale ? '<span class="pc-node-badge" aria-hidden="true">👑</span>' : info.difficulty === 'hard' ? '<span class="pc-node-badge" aria-hidden="true">🔥</span>' : ''}`;
      node.setAttribute('aria-label', level > current
        ? `Level ${level}, locked`
        : `Level ${level}: ${info.puzzle.name}, ${info.difficulty}${level < current ? `, ${stars} of 3 stars` : ', next to play'}`);
      node.addEventListener('click', () => onMapNodeTap(level));
      section.appendChild(node);
    }
    return section;
  }

  function renderLevelPath() {
    const current = save.getCurrentLevel();
    const curWorld = Math.floor((current - 1) / LEVELS_PER_WORLD);
    const map = els.levelPath;
    map.innerHTML = '';
    const frag = document.createDocumentFragment();
    // Next world shows as a locked teaser at the top; level 1 is at the bottom, like a saga map.
    for (let w = curWorld + 1; w >= 0; w--) frag.appendChild(buildWorldSection(w, current));
    // Start pad under level 1: lets the first levels scroll clear of the floating Play button.
    const foot = document.createElement('div');
    foot.className = 'pc-map-foot';
    foot.style.setProperty('--w1', worldTheme(0).c1);
    foot.innerHTML = '<span class="pc-map-start">🏁 Start</span>';
    frag.appendChild(foot);
    map.appendChild(frag);
    if (els.mapPlay) {
      const info = levelInfo(current);
      els.mapPlay.innerHTML = `<span class="pc-map-play-icon" aria-hidden="true">▶</span><span>Play Level ${current}</span><span class="pc-map-play-game" aria-hidden="true">${info.puzzle.icon}</span>`;
      els.mapPlay.setAttribute('aria-label', `Play level ${current}: ${info.puzzle.name}`);
    }
    requestAnimationFrame(() => centerOnLevel(current));
    justReachedLevel = null;
  }

  function onMapNodeTap(level) {
    const current = save.getCurrentLevel();
    if (level > current) {
      sound.error();
      UI.toast(`🔒 Beat level ${current} to open this one`, { duration: 1400 });
      return;
    }
    sound.click();
    openLevelPreview(level);
  }

  // Scrolls only the map (never the whole page) so the given level sits a
  // little below the middle, leaving room for the avatar above it.
  function centerOnLevel(level, smooth) {
    const map = els.levelPath;
    if (!map || els.panelPath.hidden || els.hub.hidden) return;
    const node = map.querySelector(`.pc-map-node[data-level="${level}"]`);
    if (!node) return;
    const c = map.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const top = map.scrollTop + (r.top - c.top) - (c.height * 0.55 - r.height / 2);
    try { map.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { map.scrollTop = top; }
  }

  function centerCurrentLevel() { centerOnLevel(save.getCurrentLevel()); }

  /* -------------------- Level preview card -------------------- */

  function openLevelPreview(level) {
    const info = levelInfo(level);
    const theme = worldTheme(info.world);
    const current = save.getCurrentLevel();
    const hist = save.getLevelHistory(level);
    const best = hist ? hist.stars : 0;
    const replay = level < current;
    prefetchGame(info.puzzle, info.index);
    const tags = [
      `<span class="pc-lp-tag pc-lp-tag--${info.difficulty}">${DIFF_LABEL[info.difficulty]}</span>`,
      info.finale ? '<span class="pc-lp-tag pc-lp-tag--finale">👑 World finale</span>' : '',
      replay ? `<span class="pc-lp-tag">Best ${best}/3 ★</span>` : '',
    ].join('');
    const bodyHtml = `
      <div class="pc-lp" style="--w1:${theme.c1};--w2:${theme.c2};--tile-color:${info.puzzle.color}">
        <div class="pc-lp-world">${theme.icon} World ${info.world + 1} · ${escapeHtml(theme.name)}</div>
        ${starRow(best, 'pc-lp-stars')}
        <div class="pc-lp-game">
          <div class="pc-lp-icon" aria-hidden="true">${info.puzzle.icon}</div>
          <div class="pc-lp-text">
            <div class="pc-lp-name">${escapeHtml(info.puzzle.name)}</div>
            <div class="pc-lp-blurb">${escapeHtml(info.puzzle.blurb)}</div>
          </div>
        </div>
        <div class="pc-lp-tags">${tags}</div>
        <p class="pc-lp-goal">🎯 ${replay && best < 3 ? 'Win again to beat your best and collect more stars.' : replay ? 'You already have every star here - play again just for fun!' : 'Win this round to open the next level on the map.'}</p>
        <details class="pc-lp-how">
          <summary>👆 How to play</summary>
          <p><b>Goal:</b> ${info.puzzle.goal}</p>
          <p><b>How:</b> ${info.puzzle.controls}</p>
          ${info.puzzle.example ? `<p><b>Example:</b> ${info.puzzle.example}</p>` : ''}
        </details>
      </div>`;
    const ref = UI.modal({
      title: `Level ${level}`,
      bodyHtml,
      buttons: [
        { label: 'Not now', className: 'pc-btn--ghost pc-btn--ghost-dark', onClick: () => { sound.click(); popPreviewHistory(); } },
        { label: replay ? '🔁 Play again' : '▶ Play', className: 'pc-btn--green pc-lp-play', onClick: () => launchLevel(level) },
      ],
    });
    if (ref && ref.el) ref.el.classList.add('pc-modal--level');
    pushPreviewHistory();
  }

  // The preview is a screen of its own for the back button: Android back
  // closes it instead of leaving the app.
  function pushPreviewHistory() {
    try { history.pushState({ pcView: 'preview' }, ''); } catch (e) { /* ignore */ }
  }
  function popPreviewHistory() {
    try {
      if (history.state && history.state.pcView === 'preview') { ignoreNextPop = true; history.back(); }
    } catch (e) { ignoreNextPop = false; }
  }

  /* -------------------- Entering / leaving the game view -------------------- */

  function unmountCurrentGame() {
    if (currentGameUnmount) { try { currentGameUnmount(); } catch (e) { console.warn('[PC] unmount failed', e); } currentGameUnmount = null; }
    currentGameHint = null;
    currentRound = null;
  }

  function enterGameView() {
    navToken++;
    stopTimer();
    unmountCurrentGame();
    els.header.hidden = true;
    els.hub.hidden = true;
    els.gameView.hidden = false;
    if (els.app) els.app.classList.remove('is-hub');
    els.hintBtn.hidden = true;
    if (els.restartBtn) els.restartBtn.hidden = true;
    els.gameTimer.textContent = '0:00';
    els.gameStage.innerHTML = '';
    pushGameHistory();
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  function launchLevel(level) {
    const info = levelInfo(level);
    enterGameView();
    els.difficultyBar.hidden = true;
    els.difficultyBar.innerHTML = '';
    els.gameTitle.textContent = `Level ${level} · ${info.puzzle.name}`;
    els.gameStage.style.setProperty('--tile-color', info.puzzle.color);
    const meta = { levelMode: true, level };
    const start = () => withGame(info.puzzle, info.index, (def) => beginRound(info.puzzle, def, info.difficulty, info.index, meta));
    // First time with a game: show the full how-to-play card. After that,
    // jump straight in (the preview card still has "How to play").
    if (hasPlayedGame(info.puzzle)) start();
    else showIntro(info.puzzle, info.difficulty, start, meta);
  }

  /* -------------------- Free play -------------------- */

  // opts.difficulty: skip the difficulty pick + intro and start right away
  // (used by the hub's Continue button).
  function launchPuzzle(puzzle, index, opts) {
    opts = opts || {};
    if (typeof index !== 'number' || index < 0) index = PUZZLES.indexOf(puzzle);
    enterGameView();
    els.difficultyBar.hidden = false;
    els.gameTitle.textContent = puzzle.name;
    els.gameStage.style.setProperty('--tile-color', puzzle.color);

    renderDifficultyBar(puzzle, null, index);
    if (opts.difficulty && PC.DIFFICULTIES.includes(opts.difficulty)) {
      withGame(puzzle, index, (def) => beginRound(puzzle, def, opts.difficulty, index));
    } else {
      prefetchGame(puzzle, index);
      const entry = save.ensurePuzzle(puzzle.id);
      const played = PC.DIFFICULTIES.some((d) => entry.tiers[d] && entry.tiers[d].plays > 0);
      showStageMessage(`
        <div style="font-size:2.6rem">${puzzle.icon}</div>
        <div class="pc-stage-msg-title">${escapeHtml(puzzle.name)}</div>
        <div>${escapeHtml(puzzle.blurb)}</div>
        <div class="pc-stage-msg-cta">👆 Pick a difficulty to ${played ? 'play' : 'start'}</div>`);
    }
  }

  function renderDifficultyBar(puzzle, def, index) {
    const entry = save.ensurePuzzle(puzzle.id);
    els.difficultyBar.innerHTML = '';
    PC.DIFFICULTIES.forEach((diff) => {
      const tier = entry.tiers[diff];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pc-diff-btn';
      btn.dataset.diff = diff;
      btn.innerHTML = `<span class="pc-diff-label">${diff}</span>${UI.starsMarkup(tier.bestStars)}`;
      btn.addEventListener('click', () => {
        sound.click();
        startGame(puzzle, def, diff, index);
      });
      els.difficultyBar.appendChild(btn);
    });
  }

  function markActiveDifficulty(difficulty) {
    els.difficultyBar.querySelectorAll('.pc-diff-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.diff === difficulty));
  }

  function startGame(puzzle, def, difficulty, index) {
    // Switching difficulty mid-round tears the old round down first.
    stopTimer();
    unmountCurrentGame();
    if (els.restartBtn) els.restartBtn.hidden = true;
    navToken++;
    markActiveDifficulty(difficulty);
    showIntro(puzzle, difficulty, () => withGame(puzzle, index, (loaded) => beginRound(puzzle, def || loaded, difficulty, index)));
  }

  /* -------------------- Shared: intro, round lifecycle, hints -------------------- */

  function showIntro(puzzle, difficulty, onStart, meta) {
    const token = navToken;
    els.gameStage.innerHTML = '';
    els.hintBtn.hidden = true;
    if (els.restartBtn) els.restartBtn.hidden = true;
    stopTimer();
    els.gameTimer.textContent = '0:00';

    const levelBadge = meta && meta.levelMode ? `<div class="pc-intro-line" style="font-weight:800;color:var(--pc-orange);">Level ${meta.level} · ${difficulty} difficulty</div>` : '';

    const card = document.createElement('div');
    card.className = 'pc-intro';
    card.innerHTML = `
      <div class="pc-intro-icon">${puzzle.icon}</div>
      <div class="pc-intro-name">${puzzle.name}</div>
      ${levelBadge}
      <div class="pc-intro-block pc-intro-block--goal">
        <div class="pc-intro-block-label">🎯 Goal</div>
        <p class="pc-intro-line">${puzzle.goal}</p>
      </div>
      <div class="pc-intro-block pc-intro-block--controls">
        <div class="pc-intro-block-label">👆 How to play</div>
        <p class="pc-intro-line">${puzzle.controls}</p>
      </div>
      ${puzzle.example ? `
      <div class="pc-intro-block pc-intro-block--example">
        <div class="pc-intro-block-label">✅ For example</div>
        <p class="pc-intro-line">${puzzle.example}</p>
      </div>` : ''}
      <p class="pc-intro-line pc-intro-tip">💡 Stuck mid-game? Tap the Hint button any time.</p>
      <button class="pc-btn pc-btn--green pc-intro-start">Let's Go, ${playerName()}! 🚀</button>
    `;
    els.gameStage.appendChild(card);
    card.querySelectorAll('.pc-intro-icon, .pc-intro-name, .pc-intro-line, .pc-intro-start').forEach((el, i) => {
      el.style.animationDelay = `${i * 90}ms`;
    });
    let started = false;
    card.querySelector('.pc-intro-start').addEventListener('click', () => {
      if (started) return; // ignore double taps
      started = true;
      sound.click();
      card.classList.add('pc-intro--leaving');
      setTimeout(() => { if (token === navToken) onStart(); }, 220);
    });
  }

  function beginRound(puzzle, def, difficulty, index, meta) {
    meta = meta || {};
    UI.clearToasts();
    def = def || Games.get(puzzle.id);
    if (!def) { withGame(puzzle, index, (d) => beginRound(puzzle, d, difficulty, index, meta)); return; }
    markActiveDifficulty(meta.levelMode ? null : difficulty);
    unmountCurrentGame();
    els.gameStage.innerHTML = '';
    stopTimer();
    startTimer();

    const name = playerName();
    const api = {
      difficulty,
      sound,
      ui: UI,
      playerName: name,
      elapsedMs: () => elapsedMs(),
      win: (stars, extra) => onGameWin(puzzle, index, difficulty, stars, extra, meta),
      lose: (msg) => { sound.error(); UI.shake(els.gameStage); if (msg) UI.toast(`${name}, ${lowerFirst(msg)}`, { color: '#d6216b' }); },
    };

    els.hintBtn.hidden = true;
    currentRound = { puzzle, def, difficulty, index, meta };
    if (save.setLastPlayed) save.setLastPlayed(puzzle.id, difficulty);

    let result;
    try {
      result = def.mount(els.gameStage, difficulty, api);
    } catch (err) {
      console.error('[PC] game failed to start', puzzle.id, err);
      stopTimer();
      currentRound = null;
      showStageMessage(`
        <div style="font-size:2rem">😵</div>
        <div>${escapeHtml(puzzle.name)} hit a snag while starting.</div>
        <div class="pc-stage-msg-actions"><button class="pc-btn pc-btn--ghost" data-act="hub">Back to hub</button></div>`);
      els.gameStage.querySelector('[data-act="hub"]').addEventListener('click', exitToHub);
      return;
    }
    if (typeof result === 'function') {
      currentGameUnmount = result;
    } else if (result && typeof result === 'object') {
      currentGameUnmount = result.unmount || null;
      currentGameHint = result.hint || null;
    }
    els.hintBtn.hidden = !currentGameHint;
    if (els.restartBtn) els.restartBtn.hidden = false;
  }

  /* -------------------- Restart -------------------- */

  function requestRestart() {
    if (!currentRound) return;
    sound.click();
    const round = currentRound;
    const doRestart = () => {
      if (currentRound !== round) return;
      beginRound(round.puzzle, round.def, round.difficulty, round.index, round.meta);
      UI.toast('🔄 Fresh start!', { duration: 900 });
    };
    if (timerInterval && elapsedMs() > RESTART_CONFIRM_AFTER_MS) {
      UI.modal({
        title: 'Restart?',
        bodyHtml: `<p style="margin:0;">Start this round over from scratch? Your current progress (${UI.formatTime(elapsedMs())}) will be lost.</p>`,
        buttons: [
          { label: 'Keep playing', className: 'pc-btn--ghost pc-btn--ghost-dark' },
          { label: '🔄 Restart', className: 'pc-btn--blue', onClick: doRestart },
        ],
      });
    } else {
      doRestart();
    }
  }

  function useHint() {
    if (!currentGameHint || hintCooldown) return;
    sound.click();
    currentGameHint();
    hintCooldown = true;
    els.hintBtn.classList.add('is-cooling');
    setTimeout(() => { hintCooldown = false; els.hintBtn.classList.remove('is-cooling'); }, 1500);
  }

  /* -------------------- Timer (pauses while the app is hidden) -------------------- */

  function elapsedMs() {
    return (timerPausedAt !== null ? timerPausedAt : Date.now()) - timerStart;
  }

  function startTimer() {
    timerStart = Date.now();
    timerPausedAt = document.hidden ? timerStart : null;
    els.gameTimer.textContent = '0:00';
    timerInterval = setInterval(() => {
      els.gameTimer.textContent = UI.formatTime(elapsedMs());
    }, 250);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerPausedAt = null;
  }

  function pauseTimer() {
    if (timerInterval && timerPausedAt === null) timerPausedAt = Date.now();
  }

  function resumeTimer() {
    if (timerPausedAt === null) return;
    timerStart += Date.now() - timerPausedAt;
    timerPausedAt = null;
    if (timerInterval) els.gameTimer.textContent = UI.formatTime(elapsedMs());
  }

  function onGameWin(puzzle, index, difficulty, stars, extra, meta) {
    meta = meta || {};
    const timeMs = elapsedMs();
    stopTimer();
    if (els.restartBtn) els.restartBtn.hidden = true;
    const { improvedStars, improvedTime } = save.recordResult(puzzle.id, difficulty, stars, timeMs);
    sound.win();
    UI.burst(window.innerWidth / 2, window.innerHeight / 2, { count: 60 });

    let levelResult = null;
    if (meta.levelMode) levelResult = save.recordLevelResult(meta.level, puzzle.id, difficulty, stars, timeMs);

    const name = playerName();
    const token = navToken;

    if (meta.levelMode) {
      const level = meta.level;
      const advanced = levelResult && levelResult.advanced;
      const worldDone = advanced && level % LEVELS_PER_WORLD === 0;
      const w = Math.floor((level - 1) / LEVELS_PER_WORLD);
      const nextLevel = Math.min(level + 1, save.getCurrentLevel());
      if (advanced) justReachedLevel = level + 1;
      const bodyHtml = `
        <div class="pc-win-stars">${UI.starsMarkup(stars, 3, true)}</div>
        <p class="pc-win-line pc-win-line--big">Level ${level} complete!</p>
        <p class="pc-win-line">⏱ ${UI.formatTime(timeMs)}${improvedTime ? ' · new best time!' : ''}</p>
        ${levelResult && levelResult.improved && !advanced ? '<p class="pc-win-line pc-win-line--good">⭐ New star record for this level!</p>' : ''}
        ${worldDone ? `<div class="pc-win-world">🏆 World ${w + 1} complete!<br><span>Next stop: ${worldTheme(w + 1).icon} ${escapeHtml(worldTheme(w + 1).name)}</span></div>` : ''}
        ${advanced && !worldDone ? `<p class="pc-win-line pc-win-line--good">🔓 Level ${level + 1} is open on the map</p>` : ''}`;
      setTimeout(() => {
        if (token !== navToken) return;
        if (advanced) sound.unlock();
        UI.modal({
          title: `${pick(WIN_PHRASES)}, ${name}!`,
          bodyHtml,
          buttons: [
            { label: '🗺️ Map', className: 'pc-btn--ghost pc-btn--ghost-dark', onClick: exitToHub },
            { label: `▶ Level ${nextLevel}`, className: 'pc-btn--green', onClick: () => backToMapThenPreview(nextLevel) },
          ],
        });
        if (worldDone) UI.burst(window.innerWidth / 2, window.innerHeight / 3, { count: 90 });
      }, 350);
      return;
    }

    const bodyHtml = `
      <div style="margin:10px 0 4px">${UI.starsMarkup(stars, 3, true)}</div>
      <p style="margin:6px 0;font-weight:800;color:var(--pc-purple)">Time: ${UI.formatTime(timeMs)} ${improvedTime ? '(new best!)' : ''}</p>
      ${improvedStars ? '<p style="color:var(--pc-green);font-weight:800;">New star record!</p>' : ''}
    `;

    setTimeout(() => {
      if (token !== navToken) return; // player already left this round
      UI.modal({
        title: `${pick(WIN_PHRASES)}, ${name}!`,
        bodyHtml,
        buttons: [
          { label: '🔁 Play Again', className: 'pc-btn--blue', onClick: () => beginRound(puzzle, Games.get(puzzle.id), difficulty, index) },
          { label: '🏠 Back to Hub', className: 'pc-btn--green', onClick: exitToHub },
        ],
      });
    }, 350);
  }

  // Win -> "Next": back on the map, glide to the next node, open its card.
  function backToMapThenPreview(level) {
    exitToHub();
    switchTab('path');
    setTimeout(() => {
      if (els.hub.hidden) return;
      centerOnLevel(level, true);
      setTimeout(() => { if (!els.hub.hidden && !(UI.hasOpenModal && UI.hasOpenModal())) openLevelPreview(level); }, 450);
    }, 120);
  }

  // On-screen back / win-modal "Back to Hub": tear down, then drop the
  // history entry we pushed on the way in so the stack stays balanced.
  function exitToHub() {
    sound.click();
    teardownToHub();
    try {
      if (history.state && history.state.pcView === 'game') {
        ignoreNextPop = true;
        history.back();
      }
    } catch (e) { ignoreNextPop = false; }
  }

  function teardownToHub() {
    navToken++;
    UI.clearToasts();
    stopTimer();
    unmountCurrentGame();
    while (UI.closeTopModal && UI.closeTopModal()) { /* close any leftover modal */ }
    els.gameStage.innerHTML = '';
    els.gameView.hidden = true;
    els.hub.hidden = false;
    els.header.hidden = false;
    if (els.restartBtn) els.restartBtn.hidden = true;
    renderHub();
  }

  /* -------------------- Settings -------------------- */

  function settingRow(id, label, checked, sub, disabled) {
    return `
      <label class="pc-setting-row${disabled ? ' is-disabled' : ''}" for="${id}">
        <span class="pc-setting-text">
          <span class="pc-setting-label">${label}</span>
          ${sub ? `<span class="pc-setting-sub">${sub}</span>` : ''}
        </span>
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      </label>`;
  }

  function openSettings() {
    sound.click();
    const musicOn = !save.getSetting('muteMusic');
    const sfxOn = !save.getSetting('muteSfx');
    const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    const hapticsOn = save.getSetting('haptics') !== false;
    const lowGfx = save.getSetting('lowGraphics') === true;
    const modalRef = UI.modal({
      title: 'Settings',
      bodyHtml: `
        <div class="pc-settings">
          ${settingRow('pc-set-music', '🎶 Music', musicOn)}
          ${settingRow('pc-set-sfx', '🔊 Sound Effects', sfxOn)}
          ${settingRow('pc-set-haptics', '📳 Vibration', canVibrate && hapticsOn, canVibrate ? 'Little buzzes on taps and wins' : 'Not supported on this device', !canVibrate)}
          ${settingRow('pc-set-lowgfx', '🐢 Low graphics', lowGfx, 'No glow or shadows - smoother on older phones. Applies when the next game starts.')}
          <button class="pc-btn pc-btn--ghost pc-btn--ghost-dark" id="pc-set-name-btn">✏️ Change name (${escapeHtml(playerName())})</button>
          <button class="pc-btn pc-btn--ghost pc-btn--ghost-dark" id="pc-set-whatsnew-btn">📜 What's New</button>
        </div>
      `,
      buttons: [
        { label: '⚠️ Reset Progress', className: 'pc-btn--ghost pc-btn--ghost-dark', close: false, onClick: confirmReset },
        { label: 'Done', className: 'pc-btn--green' },
      ],
    });
    modalRef.el.querySelector('#pc-set-music').addEventListener('change', (e) => {
      save.setSetting('muteMusic', !e.target.checked);
      sound.syncMusicWithSetting();
    });
    modalRef.el.querySelector('#pc-set-sfx').addEventListener('change', (e) => {
      save.setSetting('muteSfx', !e.target.checked);
    });
    modalRef.el.querySelector('#pc-set-haptics').addEventListener('change', (e) => {
      save.setSetting('haptics', !!e.target.checked);
      if (e.target.checked && sound.vibrate) sound.vibrate(15);
    });
    modalRef.el.querySelector('#pc-set-lowgfx').addEventListener('change', (e) => {
      save.setSetting('lowGraphics', !!e.target.checked);
    });
    modalRef.el.querySelector('#pc-set-name-btn').addEventListener('click', () => {
      modalRef.close();
      promptForName(true);
    });
    modalRef.el.querySelector('#pc-set-whatsnew-btn').addEventListener('click', () => {
      modalRef.close();
      showWhatsNew();
    });
  }

  function showWhatsNew() {
    const log = (global.PC.UpdateChecker && global.PC.UpdateChecker.getLog()) || [];
    const bodyHtml = log.length
      ? log.map((entry) => `
          <div style="text-align:left;margin-bottom:14px;">
            <div style="font-weight:800;color:var(--pc-purple);">v${entry.version} <span style="font-weight:600;color:rgba(36,20,54,0.55);font-size:0.85em;">${entry.date || ''}</span></div>
            <ul style="margin:4px 0 0;padding-left:20px;">
              ${(entry.notes || []).map((n) => `<li style="margin:2px 0;">${n}</li>`).join('')}
            </ul>
          </div>
        `).join('')
      : '<p style="color:rgba(36,20,54,0.7);">No updates logged yet on this device - check back after the app has been open with an internet connection at least once since a new version shipped.</p>';
    UI.modal({ title: "What's New", bodyHtml, buttons: [{ label: 'Close', className: 'pc-btn--green' }] });
  }

  function confirmReset() {
    UI.modal({
      title: 'Reset everything?',
      bodyHtml: '<p>This clears all stars, times, unlocked puzzles, level progress, favorites, and your name. Your sound and graphics settings are kept. This can\'t be undone.</p>',
      buttons: [
        { label: 'Cancel', className: 'pc-btn--ghost pc-btn--ghost-dark' },
        { label: 'Reset', className: 'pc-btn--blue', onClick: () => { save.resetProgress(); renderHub(); UI.toast('Progress reset'); } },
      ],
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
